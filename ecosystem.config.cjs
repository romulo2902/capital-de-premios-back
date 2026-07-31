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
      // 1G: a VPS (t3.xlarge, 4 vCPU / 16GB) e praticamente dedicada a API
      // (Postgres/Redis sao gerenciados fora, RDS/managed). Testado com o
      // import de matriz real (5M linhas): pico de ~486MB rodando sozinho,
      // sem trafego concorrente. 512M deixava so ~26MB de folga e derrubou o
      // worker em producao durante o upload; 1G da margem para trafego
      // normal no mesmo worker sem esconder um vazamento de memoria real
      // (4 workers x 1G = 4GB no pior caso, longe do teto de 16GB).
      max_memory_restart: '1G',
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 10000,
      // Sem PORT/HOST/NODE_ENV aqui de propósito: em Docker, o pm2-runtime
      // roda sem --env, então o processo herda essas variáveis do env_file
      // do container (HOST/PORT variam entre produção e homolog). Se PORT
      // fosse fixado aqui, o PM2 sobrescreveria o valor herdado e todo
      // ambiente subiria na mesma porta, causando EADDRINUSE quando dois
      // containers rodam ao mesmo tempo no host. Os blocos env_production/
      // env_homolog abaixo só são aplicados quando o PM2 bare-metal é
      // iniciado com --env explícito (scripts pm2:start / pm2:start:prod).
      env: {},
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
