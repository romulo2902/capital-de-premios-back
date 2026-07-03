module.exports = {
  apps: [
    {
      name: 'capital-premios-api',
      cwd: __dirname,
      script: 'dist/src/main.js',
      exec_mode: 'cluster',
      instances: 'max',
      autorestart: true,
      watch: false,
      time: true,
      merge_logs: true,
      max_memory_restart: '512M',
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 10000,
      // Sem NODE_ENV aqui de propósito: em Docker, o pm2-runtime roda sem
      // --env, então o processo herda o NODE_ENV real do env_file do
      // container. Os blocos env_production/env_homolog abaixo só são
      // aplicados quando o PM2 bare-metal é iniciado com --env explícito
      // (scripts pm2:start / pm2:start:prod).
      env: {
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
