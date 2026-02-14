/**
 * Integration uploader module - provides extensible file upload capability
 * for different CMS integrations.
 *
 * Each integration uploader implements a common interface:
 * - canHandle(sourceIntegration) - returns true if this uploader handles the integration type
 * - upload({ config, localFilePath, sourceIntegration, log }) - uploads the file
 */

import { HerettoUploader } from "./heretto.js";

// Registry of available uploaders
const uploaders: any[] = [
  new HerettoUploader(),
];

/**
 * Selects the first registered uploader that can handle the provided source integration.
 *
 * @param sourceIntegration - Source integration metadata (e.g., from a step result) used to match an uploader
 * @returns The uploader instance that can handle `sourceIntegration`, or `null` if no match is found
 */
function getUploader(sourceIntegration: any) {
  if (!sourceIntegration?.type) return null;

  for (const uploader of uploaders) {
    if (uploader.canHandle(sourceIntegration)) {
      return uploader;
    }
  }

  return null;
}

/**
 * Collects changed files that include source integration metadata from a test execution report.
 *
 * @param report - The test execution report to scan for changed files
 * @returns An array of objects each containing `localPath`, `sourceIntegration`, `stepId`, `testId`, and `specId`
 */
function collectChangedFiles(report: any) {
  const changedFiles: any[] = [];

  if (!report?.specs) return changedFiles;

  for (const spec of report.specs) {
    for (const test of spec.tests || []) {
      for (const context of test.contexts || []) {
        for (const step of context.steps || []) {
          // Check if this step has a changed screenshot with source integration
          if (
            step.screenshot &&
            step.outputs?.changed === true &&
            step.outputs?.sourceIntegration
          ) {
            changedFiles.push({
              localPath: step.outputs.screenshotPath,
              sourceIntegration: step.outputs.sourceIntegration,
              stepId: step.stepId,
              testId: test.testId,
              specId: spec.specId,
            });
          }
        }
      }
    }
  }

  return changedFiles;
}

/**
 * Upload changed files from a test report to their configured source integrations.
 *
 * Continues uploading other files if individual uploads fail and returns an aggregated summary.
 *
 * @param config - Doc Detective configuration containing integration definitions
 * @param report - Test execution report produced by runSpecs
 * @param log - Logging function with signature (config, level, message)
 * @returns An object summarizing uploads:
 *   - `total`: total number of changed files found
 *   - `successful`: number of files uploaded with status "PASS"
 *   - `failed`: number of files that failed to upload
 *   - `skipped`: number of files not attempted due to missing uploader or config
 *   - `details`: array of per-file results containing `localPath`, `status` ("PASS" | "FAIL" | "SKIPPED"), and an optional `description` or `reason`
 */
async function uploadChangedFiles({ config, report, log }: { config: any; report: any; log: any }) {
  const results: { total: number; successful: number; failed: number; skipped: number; details: any[] } = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  const changedFiles = collectChangedFiles(report);
  results.total = changedFiles.length;

  if (changedFiles.length === 0) {
    log(config, "debug", "No changed files to upload.");
    return results;
  }

  log(config, "info", `Found ${changedFiles.length} changed file(s) to upload.`);

  // Prepare upload tasks, filtering out files without valid uploaders or configs
  const uploadTasks: any[] = [];

  for (const file of changedFiles) {
    const uploader = getUploader(file.sourceIntegration);

    if (!uploader) {
      log(
        config,
        "warning",
        `No uploader found for integration type: ${file.sourceIntegration.type}`
      );
      results.skipped++;
      results.details.push({
        localPath: file.localPath,
        status: "SKIPPED",
        reason: `No uploader for type: ${file.sourceIntegration.type}`,
      });
      continue;
    }

    // Get the integration config for API credentials
    const integrationConfig = getIntegrationConfig(
      config,
      file.sourceIntegration
    );

    if (!integrationConfig) {
      log(
        config,
        "warning",
        `No integration config found for: ${file.sourceIntegration.integrationName}`
      );
      results.skipped++;
      results.details.push({
        localPath: file.localPath,
        status: "SKIPPED",
        reason: `No integration config found for: ${file.sourceIntegration.integrationName}`,
      });
      continue;
    }

    // Queue this file for parallel upload
    uploadTasks.push({
      file,
      uploader,
      integrationConfig,
    });
  }

  // Execute all uploads in parallel using Promise.allSettled
  if (uploadTasks.length > 0) {
    log(config, "debug", `Executing ${uploadTasks.length} upload(s) in parallel...`);

    const uploadPromises = uploadTasks.map(async ({ file, uploader, integrationConfig }: any) => {
      log(
        config,
        "info",
        `Uploading ${file.localPath} to ${file.sourceIntegration.type}...`
      );

      try {
        const uploadResult = await uploader.upload({
          config,
          integrationConfig,
          localFilePath: file.localPath,
          sourceIntegration: file.sourceIntegration,
          log,
        });

        return { file, uploadResult, error: null };
      } catch (error) {
        // Catch errors within the promise to preserve file reference
        return { file, uploadResult: null, error };
      }
    });

    const settledResults = await Promise.allSettled(uploadPromises);

    for (const settled of settledResults) {
      // All promises should be fulfilled since we catch errors internally
      const { file, uploadResult, error } = (settled as PromiseFulfilledResult<any>).value;

      if (error) {
        results.failed++;
        log(
          config,
          "warning",
          `Error uploading ${file.localPath}: ${error.message}`
        );
        results.details.push({
          localPath: file.localPath,
          status: "FAIL",
          description: error.message,
        });
      } else if (uploadResult.status === "PASS") {
        results.successful++;
        log(config, "info", `Successfully uploaded: ${file.localPath}`);
        results.details.push({
          localPath: file.localPath,
          status: uploadResult.status,
          description: uploadResult.description,
        });
      } else {
        results.failed++;
        log(
          config,
          "warning",
          `Failed to upload ${file.localPath}: ${uploadResult.description}`
        );
        results.details.push({
          localPath: file.localPath,
          status: uploadResult.status,
          description: uploadResult.description,
        });
      }
    }
  }

  log(
    config,
    "info",
    `Upload complete: ${results.successful} successful, ${results.failed} failed, ${results.skipped} skipped`
  );

  return results;
}

/**
 * Retrieve the integration configuration that corresponds to a source integration.
 *
 * @param config - Doc Detective configuration object containing integration entries
 * @param sourceIntegration - Source integration metadata; must include `type` and `integrationName`
 * @returns The matching integration configuration object, or `null` if no match is found
 */
function getIntegrationConfig(config: any, sourceIntegration: any) {
  if (!sourceIntegration?.type || !sourceIntegration?.integrationName) {
    return null;
  }

  switch (sourceIntegration.type) {
    case "heretto":
      return config?.integrations?.heretto?.find(
        (h: any) => h.name === sourceIntegration.integrationName
      ) ?? null;
    default:
      return null;
  }
}

/**
 * Adds an uploader implementation to the runtime registry.
 *
 * @param uploader - Uploader instance; must implement `canHandle(sourceIntegration): boolean` and `upload(args): Promise<any>` where `args` includes `config`, `integrationConfig`, `localFilePath`, `sourceIntegration`, and `log`
 * @throws Error if `uploader` does not implement the required `canHandle` and `upload` methods
 */
function registerUploader(uploader: any) {
  if (typeof uploader.canHandle !== "function" || typeof uploader.upload !== "function") {
    throw new Error("Uploader must implement canHandle and upload methods");
  }
  uploaders.push(uploader);
}

export {
  getUploader,
  collectChangedFiles,
  uploadChangedFiles,
  getIntegrationConfig,
  registerUploader,
};