module.exports = {
  apps: [
    {
      name: "ductly-staging",
      script: "./server.js",
      cwd: "/var/www/vhosts/ductly.ae/httpdocs",
      env: {
        NODE_ENV: "development",
        APP_ENV: "staging",
        PORT: 3002,
      },
      autorestart: true,
      watch: false,
    },
    {
      name: "ductly-production",
      script: "./server.js",
      cwd: "/var/www/vhosts/ductly.ae/httpdocs",
      env: {
        NODE_ENV: "production",
        APP_ENV: "production",
        PORT: 3003,
      },
      autorestart: true,
      watch: false,
    },
  ],
};
