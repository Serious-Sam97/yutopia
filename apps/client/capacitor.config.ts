// Native shell (Android/iOS), same approach as Yondra: the app loads the hosted
// client, so the world, voice and updates ship without app-store releases.
//   pnpm add -D @capacitor/cli @capacitor/core @capacitor/android && npx cap add android
// Needs microphone/camera permissions in the generated AndroidManifest (see docs/DEPLOY.md).
const config = {
  appId: "com.yondra.yutopia",
  appName: "Yutopia",
  webDir: "public",
  server: {
    url: process.env.YUTOPIA_PUBLIC_URL ?? "https://yutopia.example.com",
    cleartext: false,
  },
};

export default config;
