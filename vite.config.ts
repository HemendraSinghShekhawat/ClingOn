import { defineConfig } from "vite";
import { resolve } from "path";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "fs";

export default defineConfig({
  root: "src",
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content/content.ts"),
        dashboard: resolve(__dirname, "src/dashboard/dashboard.html"),
        "service-worker": resolve(
          __dirname,
          "src/background/service-worker.ts"
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name].[ext]",
        // Keep all code from shared modules duplicated into each entry
        // to avoid chunk loading issues in content scripts
        manualChunks: undefined,
      },
    },
    target: "chrome110",
    minify: false,
    sourcemap: false,
  },
  plugins: [
    {
      name: "fix-extension-output",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");

        // Move dashboard.html from dashboard/ subdirectory to root and fix paths
        const nestedDash = resolve(distDir, "dashboard/dashboard.html");
        if (existsSync(nestedDash)) {
          let html = readFileSync(nestedDash, "utf-8");
          // File was in dashboard/, now at root — fix ../ references
          html = html.replace(/\.\.\/assets\//g, "./assets/");
          html = html.replace(/\.\.\/chunks\//g, "./chunks/");
          html = html.replace(/\.\.\/dashboard\.js/g, "./dashboard.js");
          writeFileSync(resolve(distDir, "dashboard.html"), html);
          rmSync(resolve(distDir, "dashboard"), { recursive: true, force: true });
        }

        // Fix content.js and service-worker.js to be self-executing
        // by wrapping any ES module imports into inline code
        for (const file of ["content.js", "service-worker.js"]) {
          const filePath = resolve(distDir, file);
          if (existsSync(filePath)) {
            let code = readFileSync(filePath, "utf-8");

            // If the file has chunk imports, we need to inline them
            const importRegex =
              /import\s*\{([^}]+)\}\s*from\s*["']\.\/chunks\/([^"']+)["'];?/g;
            let match;
            const imports: {
              full: string;
              names: string;
              chunkFile: string;
            }[] = [];

            while ((match = importRegex.exec(code)) !== null) {
              imports.push({
                full: match[0],
                names: match[1],
                chunkFile: match[2],
              });
            }

            if (imports.length > 0) {
              // Read each chunk and prepend it, then remove the import
              let preamble = "";
              for (const imp of imports) {
                const chunkPath = resolve(distDir, "chunks", imp.chunkFile);
                if (existsSync(chunkPath)) {
                  let chunkCode = readFileSync(chunkPath, "utf-8");
                  // Strip export statements (not valid inside IIFE)
                  chunkCode = chunkCode.replace(
                    /export\s*\{[\s\S]*?\};?\s*$/,
                    ""
                  );
                  preamble += chunkCode + "\n";
                }
                code = code.replace(imp.full, "");
              }

              // Wrap everything in an IIFE
              code = `(function() {\n${preamble}\n${code}\n})();\n`;
              writeFileSync(filePath, code);
            }
          }
        }

        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, "src/manifest.json"),
          resolve(distDir, "manifest.json")
        );

        // Copy icons
        const iconsDir = resolve(__dirname, "icons");
        const distIconsDir = resolve(distDir, "icons");
        if (existsSync(iconsDir)) {
          if (!existsSync(distIconsDir)) mkdirSync(distIconsDir);
          for (const file of readdirSync(iconsDir)) {
            copyFileSync(
              resolve(iconsDir, file),
              resolve(distIconsDir, file)
            );
          }
        }

        // Copy card.css (used via ?raw import — already bundled, but keep as fallback)
        const cardCss = resolve(__dirname, "src/content/card.css");
        if (existsSync(cardCss)) {
          copyFileSync(cardCss, resolve(distDir, "card.css"));
        }
      },
    },
  ],
});
