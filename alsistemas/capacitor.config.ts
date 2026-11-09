import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.alsistemas.painel',
  appName: 'AL Sistemas',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    // Para rodar localmente no Termux, comente a linha `url` abaixo
    // e use `npx cap copy android` + build local.
    // url: 'https://alsistemas.vercel.app',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: 'release.keystore',
      keystoreAlias: 'alsistemas',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#FAFAF7',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
}

export default config
