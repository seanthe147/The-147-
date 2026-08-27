module.exports = {
  dependencies: {
    // Native Square APIs are used only by useSquareGooglePay.android.ts.
    // iOS uses the Web Payments sheet, so linking Square's iOS frameworks
    // needlessly bloats the app and causes App Store nested-bundle validation
    // failures when the framework setup phase is not run.
    "react-native-square-in-app-payments": {
      platforms: {
        ios: null,
      },
    },
  },
};