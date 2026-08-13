/**
 * Starting with the iOS 27 SDK, UIKit requires the scene-based lifecycle —
 * an app with only a UIApplicationDelegate (no UISceneDelegate) fails to
 * launch. Expo/React Native's generated AppDelegate still creates its
 * UIWindow directly and has no scene manifest, so without this plugin the
 * app crashes on launch (EXC_BREAKPOINT in
 * UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption) on iOS 27+.
 *
 * This plugin declares a single, non-multi-window scene configuration and
 * moves window creation + React Native bootstrap from AppDelegate into a
 * SceneDelegate appended to the same file, so it survives `expo prebuild`
 * instead of requiring a hand-edited native project.
 *
 * Plain JS, not TS: app.config.ts only transpiles its own entry file, and
 * plugins it `require()`s are resolved by plain Node CJS, which won't load
 * a .ts file.
 */
const { CodeGenerator, withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const TAG = 'with-scene-delegate';

const SCENE_DELEGATE_SWIFT = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)

    if let url = connectionOptions.urlContexts.first?.url {
      RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    } else if let userActivity = connectionOptions.userActivities.first {
      RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

const withSceneManifest = (config) =>
  withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });

const withSceneDelegateSource = (config) =>
  withAppDelegate(config, (config) => {
    const original = config.modResults.contents;

    // The window used to be created directly in AppDelegate; now the scene
    // creates it once UIKit connects a UIWindowScene. Leaving both in place
    // would start React Native twice, so this removal must succeed.
    const withoutDirectWindow = original.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)[\s\S]*?factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s*\n#endif\n/,
      '',
    );
    if (withoutDirectWindow === original) {
      throw new Error(
        `[${TAG}] Could not find the expected direct-window-creation block in AppDelegate.swift to remove. ` +
          `The Expo/React Native AppDelegate template may have changed — update the regex in plugins/with-scene-delegate.js.`,
      );
    }

    const merged = CodeGenerator.mergeContents({
      src: withoutDirectWindow,
      newSrc: SCENE_DELEGATE_SWIFT,
      tag: TAG,
      anchor: /^class ReactNativeDelegate/m,
      offset: 0,
      comment: '//',
    });

    config.modResults.contents = merged.contents;
    return config;
  });

const withSceneDelegate = (config) => withSceneDelegateSource(withSceneManifest(config));

module.exports = withSceneDelegate;
