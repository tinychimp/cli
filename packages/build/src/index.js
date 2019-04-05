const path = require("path");
const webpack = require("webpack");
const ExtractCSSPlugin = require("mini-css-extract-plugin");
const IgnoreEmitPlugin = require("ignore-emit-webpack-plugin");
const InjectPlugin = require("webpack-inject-plugin").default;
const MinifyCSSPlugin = require("csso-webpack-plugin").default;
const MinifyImgPlugin = require("imagemin-webpack-plugin").default;
const CompressionPlugin = require("compression-webpack-plugin");
const BrotliPlugin = require("brotli-webpack-plugin");
const MarkoPlugin = require("@marko/webpack/plugin").default;

const { useAppModuleOrFallback, getRouterCode } = require("./util");

const HASH = "[hash:10]";
const SERVER_FILE = path.join(__dirname, "./files/server.js");
const CWD = process.cwd();

module.exports = ({
  dir,
  file,
  production = true,
  output = "build",
  serverPlugins = [],
  clientPlugins = []
}) => {
  const MODE = production ? "production" : "development";
  const DEVTOOL = production ? "source-map" : "cheap-module-source-map";
  const BUILD_PATH = path.resolve(CWD, production ? output : "");
  const ASSETS_PATH = path.join(BUILD_PATH, "assets");
  const PUBLIC_PATH = "/assets/";
  const APP_DIR = dir || path.dirname(file);
  const markoPlugin = new MarkoPlugin();
  const markoCompiler = (() => {
    process.env.APP_DIR = APP_DIR;
    return require.resolve("./marko-compiler");
  })();

  const sharedAliases = () => ({
    marko: useAppModuleOrFallback(APP_DIR, "marko"),
    "connect-gzip-static": useAppModuleOrFallback(
      APP_DIR,
      "connect-gzip-static"
    ),
    "source-map-support": useAppModuleOrFallback(APP_DIR, "source-map-support")
  });

  const sharedRules = isServer => [
    {
      test: /\.marko$/,
      loader: require.resolve("@marko/webpack/loader"),
      options: {
        compiler: markoCompiler
      }
    },
    {
      test: /\.css$/,
      exclude: /node_modules/,
      use: [
        ExtractCSSPlugin.loader,
        {
          loader: require.resolve("css-loader"),
          options: {
            modules: false,
            sourceMap: true,
            importLoaders: 1
          }
        }
      ]
    },
    {
      test: file => !/\.(js(on)?|css|marko)$/.test(file),
      loader: require.resolve("file-loader"),
      options: {
        publicPath: PUBLIC_PATH,
        name: production ? `${HASH}.[ext]` : `[name].${HASH}.[ext]`,
        outputPath: path.relative(
          isServer ? BUILD_PATH : ASSETS_PATH,
          ASSETS_PATH
        )
      }
    }
  ];

  const sharedConfig = isServer => ({
    mode: MODE,
    bail: true,
    context: __dirname,
    devtool: DEVTOOL,
    resolve: { alias: sharedAliases(isServer) },
    module: { rules: sharedRules(isServer) }
  });

  if (production) {
    serverPlugins = serverPlugins.concat([]);
    clientPlugins = clientPlugins.concat([
      new MinifyCSSPlugin(),
      new MinifyImgPlugin(),
      new CompressionPlugin(),
      new BrotliPlugin()
    ]);
  }

  const serverConfig = {
    name: "Server",
    target: "async-node",
    entry: SERVER_FILE,
    cache: false,
    output: {
      pathinfo: true,
      path: BUILD_PATH,
      publicPath: PUBLIC_PATH,
      filename: "index.js",
      chunkFilename: `[name].${HASH}.js`,
      libraryTarget: "commonjs2"
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.browser": undefined,
        "process.env.BUNDLE": true,
        "global.PORT": production ? 3000 : "'0'",
        "global.ASSETS_PATH": JSON.stringify(ASSETS_PATH)
      }),
      new ExtractCSSPlugin({
        filename: "index.css",
        allChunks: true
      }),
      new IgnoreEmitPlugin("index.css"),
      new InjectPlugin(() =>
        dir
          ? getRouterCode(dir)
          : `const template = require(${JSON.stringify(
              file
            )}); global.GET_ROUTE = () => ({ key:'main', template });`
      ),
      markoPlugin.server,
      ...serverPlugins
    ],
    ...sharedConfig(true)
  };

  const browserConfig = {
    name: "Browser",
    target: "web",
    entry: markoPlugin.emptyEntry,
    output: {
      pathinfo: true,
      publicPath: PUBLIC_PATH,
      path: ASSETS_PATH,
      filename: `[name].[chunkhash:10].js`,
      libraryTarget: "var",
      devtoolModuleFilenameTemplate: production
        ? "webpack://[namespace]/[resource-path]?[loaders]"
        : info => info.absoluteResourcePath + "?" + info.hash
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.browser": true
      }),
      new ExtractCSSPlugin({
        filename: `[name].[chunkhash:10].css`,
        allChunks: true
      }),
      markoPlugin.browser,
      ...clientPlugins
    ],
    ...sharedConfig(false)
  };

  return webpack([browserConfig, serverConfig]);
};