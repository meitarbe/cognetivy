import { test, describe } from "node:test";
import assert from "node:assert";
import { getCloudAppUrl, buildCloudOnboardingUrl } from "../dist/onboarding-url.js";

describe("buildCloudOnboardingUrl", () => {
  test("returns appUrl when workflowId is null", () => {
    assert.strictEqual(
      buildCloudOnboardingUrl("https://app.example.com", null),
      "https://app.example.com"
    );
  });

  test("returns workflow deep link when workflowId is set", () => {
    assert.strictEqual(
      buildCloudOnboardingUrl("https://app.example.com", "wf_123"),
      "https://app.example.com/workflows/wf_123"
    );
  });

  test("strips trailing slash from appUrl before appending path", () => {
    assert.strictEqual(
      buildCloudOnboardingUrl("https://app.example.com/", "wf_abc"),
      "https://app.example.com/workflows/wf_abc"
    );
  });

  test("encodes workflow_id in path", () => {
    assert.strictEqual(
      buildCloudOnboardingUrl("https://app.example.com", "wf_foo-bar"),
      "https://app.example.com/workflows/wf_foo-bar"
    );
  });
});

describe("getCloudAppUrl", () => {
  test("uses COGNETIVY_APP_URL when set and strips trailing slash", () => {
    const orig = process.env.COGNETIVY_APP_URL;
    process.env.COGNETIVY_APP_URL = "http://localhost:5174/";
    try {
      assert.strictEqual(getCloudAppUrl(), "http://localhost:5174");
    } finally {
      if (orig !== undefined) process.env.COGNETIVY_APP_URL = orig;
      else delete process.env.COGNETIVY_APP_URL;
    }
  });

  test("returns production URL when no env set", () => {
    const origApp = process.env.COGNETIVY_APP_URL;
    const origDev = process.env.NODE_ENV;
    const origCognetivyDev = process.env.COGNETIVY_DEV;
    delete process.env.COGNETIVY_APP_URL;
    process.env.NODE_ENV = "production";
    delete process.env.COGNETIVY_DEV;
    try {
      assert.strictEqual(getCloudAppUrl(), "https://alpha.cognetivy.com");
    } finally {
      if (origApp !== undefined) process.env.COGNETIVY_APP_URL = origApp;
      else delete process.env.COGNETIVY_APP_URL;
      if (origDev !== undefined) process.env.NODE_ENV = origDev;
      else delete process.env.NODE_ENV;
      if (origCognetivyDev !== undefined) process.env.COGNETIVY_DEV = origCognetivyDev;
      else delete process.env.COGNETIVY_DEV;
    }
  });
});
