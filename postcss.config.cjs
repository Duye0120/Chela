const path = require("node:path");

const ensurePostCssFrom = {
  postcssPlugin: "chela-ensure-postcss-from",
  Once(root, { result }) {
    if (result.opts.from) {
      return;
    }

    result.opts.from =
      root.source?.input?.file ??
      path.join(process.cwd(), "src/renderer/src/styles.css");
  },
};

module.exports = {
  plugins: [ensurePostCssFrom, require("@tailwindcss/postcss"), require("autoprefixer")],
};
