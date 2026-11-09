const path = require('path');

function stripForkTsCheckerPlugin(config) {
  if (!config || !Array.isArray(config.plugins)) {
    return config;
  }

  config.plugins = config.plugins.filter((plugin) => {
    const name = plugin && plugin.constructor && plugin.constructor.name;
    return !(name && name.includes('ForkTsChecker'));
  });

  return config;
}

function patchWebpackConfigFactory() {
  const configFactoryPath = require.resolve('react-scripts/config/webpack.config');
  const originalFactory = require(configFactoryPath);

  require.cache[configFactoryPath].exports = function patchedFactory(env) {
    const config = originalFactory(env);
    return stripForkTsCheckerPlugin(config);
  };
}

function run() {
  const command = process.argv[2];
  const extraArgs = process.argv.slice(3);
  if (!command || !['start', 'build'].includes(command)) {
    // eslint-disable-next-line no-console
    console.error('Usage: node scripts/run-cra.js <start|build>');
    process.exit(1);
  }

  if (command === 'start') {
    process.env.BABEL_ENV = 'development';
    process.env.NODE_ENV = 'development';
    process.env.DANGEROUSLY_DISABLE_HOST_CHECK =
      process.env.DANGEROUSLY_DISABLE_HOST_CHECK || 'true';
  } else {
    process.env.BABEL_ENV = 'production';
    process.env.NODE_ENV = 'production';
  }

  process.argv = [process.argv[0], process.argv[1], ...extraArgs];
  patchWebpackConfigFactory();

  const scriptPath = path.join('react-scripts', 'scripts', command);
  require(scriptPath);
}

run();
