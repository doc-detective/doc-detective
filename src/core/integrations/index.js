/**
 * Integration uploader module - provides extensible file upload capability
 * for different CMS integrations.
 * 
 * Each integration uploader implements a common interface:
 * - canHandle(sourceIntegration) - returns true if this uploader handles the integration type
 * - upload({ config, localFilePath, sourceIntegration, log }) - uploads the file
 */

const { HerettoUploader } = require("./heretto");

// Registry of available uploaders
const uploaders = [
  new HerettoUploader(),
];

/**
 * Finds the appropriate uploader for a given source integration.
 * @param {Object} sourceIntegration - Source integration metadata from step result
 * @returns {Object|null} Uploader instance or null if none found
 */
function getUploader(sourceIntegration) {
  if (!sourceIntegration?.type) return null;
  
  for (const uploader of uploaders) {
    if (uploader.canHandle(sourceIntegration)) {
      return uploader;
    }
  }
  
  return null;
}

/**
 * Collects all changed files from a test report that have source integrations.
 * @param {Object} report - Test execution report
 * @returns {Array<{localPath: string, sourceIntegration: Object, stepId: string, testId: string, specId: string}>} Array of changed file objects containing:
 *   - localPath: Path to the local file
 *   - sourceIntegration: Source integration metadata (type, integrationName, filePath, contentPath)
 *   - stepId: ID of the step that produced this file
 *   - testId: ID of the test containing this step
 *   - specId: ID of the spec containing this test
 */
function collectChangedFiles(report) {
  const changedFiles = [];
  
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
 * Uploads all changed files back to their source integrations.
 * Uses best-effort approach - continues uploading even if individual uploads fail.
 * Uploads are executed in parallel using Promise.allSettled for better performance.
 * @param {Object} options - Upload options
 * @param {Object} options.config - Doc Detective config containing integration configurations
 * @param {Object} options.report - Test execution report from runSpecs
 * @param {Function} options.log - Logging function with signature (config, level, message)
 * @returns {Promise<{total: number, successful: number, failed: number, skipped: number, details: Array<{localPath: string, status: string, description?: string, reason?: string}>}>} Upload results summary with:
 *   - total: Total number of changed files found
 *   - successful: Number of files successfully uploaded
 *   - failed: Number of files that failed to upload
 *   - skipped: Number of files skipped (no uploader or config found)
 *   - details: Array of per-file results with localPath, status (PASS/FAIL/SKIPPED), and description or reason
 */
async function uploadChangedFiles({ config, report, log }) {
  const results = {
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
  const uploadTasks = [];
  
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
    
    const uploadPromises = uploadTasks.map(async ({ file, uploader, integrationConfig }) => {
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
      const { file, uploadResult, error } = settled.value;
      
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
 * Gets the integration configuration for a source integration.
 * @param {Object} config - Doc Detective config
 * @param {Object} sourceIntegration - Source integration metadata
 * @returns {Object|null} Integration configuration or null if not found
 */
function getIntegrationConfig(config, sourceIntegration) {
  if (!sourceIntegration?.type || !sourceIntegration?.integrationName) {
    return null;
  }
  
  switch (sourceIntegration.type) {
    case "heretto":
      return config?.integrations?.heretto?.find(
        (h) => h.name === sourceIntegration.integrationName
      ) ?? null;
    default:
      return null;
  }
}

/**
 * Registers a new uploader.
 * @param {Object} uploader - Uploader instance implementing canHandle and upload methods
 */
function registerUploader(uploader) {
  if (typeof uploader.canHandle !== "function" || typeof uploader.upload !== "function") {
    throw new Error("Uploader must implement canHandle and upload methods");
  }
  uploaders.push(uploader);
}

module.exports = {
  getUploader,
  collectChangedFiles,
  uploadChangedFiles,
  getIntegrationConfig,
  registerUploader,
};
