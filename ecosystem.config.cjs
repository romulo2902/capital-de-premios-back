module.exports = {
  apps: [
    {
      name: 'capital-premios-api',
      cwd: __dirname,
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
      merge_logs: true,
      max_memory_restart: '512M',
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
      env_homolog: {
        NODE_ENV: 'homolog',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
    },
  ],
};
