import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'ph.gov.deped.marinduque.attendance',
  appName: 'DepEd Attendance',
  webDir: 'public',
  bundledWebRuntime: false,
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://')
        }
      }
    : {})
};

export default config;
