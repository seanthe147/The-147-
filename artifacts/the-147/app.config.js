/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "The 147",
  slug: "the-147",
  version: "2.8.7",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: "the147",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0A1628",
  },
  ios: {
    supportsTablet: true,
    requireFullScreen: true,
    bundleIdentifier: "com.the147bradford.app",
    buildNumber: "68",
    entitlements: {
      "com.apple.developer.in-app-payments": ["merchant.com.the147bradford.app"],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSFaceIDUsageDescription:
        "Use Face ID to sign in to your 147 Bradford account quickly and securely.",
      NSLocationWhenInUseUsageDescription:
        "The 147 uses your location only when staff clock in or out, to verify you're at the venue.",
      NSPhotoLibraryUsageDescription:
        "The 147 needs access to your photo library so staff can upload banner and event images for the app.",
      NSCameraUsageDescription:
        "The 147 may use the camera to capture photos for banners and event images uploaded by staff.",
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
      ],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhoneNumber",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePaymentInfo",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypePreciseLocation",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypePurchaseHistory",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeCoarseLocation",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
      ],
      NSPrivacyTracking: false,
    },
  },
  android: {
    package: "com.the147bradford.venue",
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    permissions: [],
    blockedPermissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
    adaptiveIcon: {
      backgroundColor: "#0A1628",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    versionCode: 116,
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: "https://replit.com/",
      },
    ],
    "expo-font",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#0A1628",
        sounds: [],
      },
    ],
    "expo-secure-store",
    "@react-native-community/datetimepicker",
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {
      origin: "https://replit.com/",
    },
    eas: {
      projectId: "3f31dfb1-b149-43ca-ab9a-91b6d7cb230a",
    },
  },
  owner: "the-147",
  runtimeVersion: "2.8.7",
  updates: {
    url: "https://u.expo.dev/3f31dfb1-b149-43ca-ab9a-91b6d7cb230a",
    requestHeaders: {
      "expo-channel-name": "production",
    },
  },
};
