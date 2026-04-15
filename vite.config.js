import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { defineConfig } from "vite";

async function getPngFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return getPngFiles(fullPath);
      }

      return extname(entry.name).toLowerCase() === ".png" ? [fullPath] : [];
    }),
  );

  return files.flat();
}

function pngToWebpPlugin() {
  const projectRoot = resolve(process.cwd());
  const imagesDirectory = resolve(projectRoot, "images");

  async function convertPngToWebp() {
    const pngFiles = await getPngFiles(imagesDirectory);

    await Promise.all(
      pngFiles.map(async (pngPath) => {
        const webpPath = pngPath.replace(/\.png$/i, ".webp");
        const [pngStats, webpStats] = await Promise.all([
          stat(pngPath),
          stat(webpPath).catch(() => null),
        ]);

        if (webpStats && webpStats.mtimeMs >= pngStats.mtimeMs) {
          return;
        }

        await sharp(pngPath).webp({ quality: 100 }).toFile(webpPath);
      }),
    );
  }

  return {
    name: "png-to-webp",
    async buildStart() {
      await convertPngToWebp();
    },
    configureServer(server) {
      convertPngToWebp().catch((error) =>
        server.config.logger.error(error.message),
      );
    },
  };
}

function htmlPartialsPlugin() {
  const includePattern = /<!--\s*@include\s+(.+?)\s*-->/g;
  const projectRoot = resolve(process.cwd());

  async function resolveIncludes(
    template,
    importer = "index.html",
    seen = new Set(),
  ) {
    const matches = Array.from(template.matchAll(includePattern));
    if (!matches.length) {
      return template;
    }

    let output = template;

    for (const match of matches) {
      const [directive, includePath] = match;
      const normalizedPath = includePath.trim();
      const absolutePath = resolve(projectRoot, normalizedPath);
      const chainKey = `${importer} -> ${normalizedPath}`;

      if (seen.has(absolutePath)) {
        throw new Error(`Circular partial include detected: ${chainKey}`);
      }

      if (!existsSync(absolutePath)) {
        throw new Error(`Partial not found: ${normalizedPath}`);
      }

      seen.add(absolutePath);
      const partialContent = await readFile(absolutePath, "utf8");
      const resolvedPartial = await resolveIncludes(
        partialContent,
        normalizedPath,
        seen,
      );
      seen.delete(absolutePath);
      output = output.replace(directive, resolvedPartial);
    }

    return output;
  }

  return {
    name: "html-partials",
    enforce: "pre",
    async transformIndexHtml(html) {
      return resolveIncludes(html);
    },
  };
}

function htmlImagesToAssetsPlugin() {
  const projectRoot = resolve(process.cwd());
  const buildRoot = resolve(projectRoot, "docs");
  const htmlPath = resolve(buildRoot, "index.html");
  const sourceImagesDirectory = resolve(projectRoot, "images");
  const outputAssetsDirectory = resolve(buildRoot, "assets");

  return {
    name: "html-images-to-assets",
    async writeBundle() {
      if (!existsSync(htmlPath)) {
        return;
      }

      let html = await readFile(htmlPath, "utf8");
      const imageMatches = Array.from(
        html.matchAll(/src=(["'])images\/([^"']+\.webp)\1/g),
      );

      if (imageMatches.length === 0) {
        await rm(resolve(buildRoot, "images"), {
          recursive: true,
          force: true,
        });
        return;
      }

      await mkdir(outputAssetsDirectory, { recursive: true });
      const rewrittenSources = new Map();

      for (const match of imageMatches) {
        const relativeImagePath = match[2];
        if (rewrittenSources.has(relativeImagePath)) {
          continue;
        }

        const sourcePath = resolve(sourceImagesDirectory, relativeImagePath);
        const imageBuffer = await readFile(sourcePath);
        const hash = createHash("sha256")
          .update(imageBuffer)
          .digest("hex")
          .slice(0, 8);
        const filename = basename(relativeImagePath, ".webp");
        const outputName = `${filename}-${hash}.webp`;
        const outputPath = resolve(outputAssetsDirectory, outputName);

        await copyFile(sourcePath, outputPath);
        rewrittenSources.set(relativeImagePath, `assets/${outputName}`);
      }

      html = html.replace(
        /src=(["'])images\/([^"']+\.webp)\1/g,
        (fullMatch, quote, relativeImagePath) => {
          const builtPath = rewrittenSources.get(relativeImagePath);
          if (!builtPath) {
            return fullMatch;
          }

          return `src=${quote}${builtPath}${quote}`;
        },
      );

      await writeFile(htmlPath, html, "utf8");
      await rm(resolve(buildRoot, "images"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    htmlPartialsPlugin(),
    pngToWebpPlugin(),
    htmlImagesToAssetsPlugin(),
  ],
  server: {
    open: true,
  },
  build: {
    outDir: "docs",
    assetsDir: "assets",
  },
});
