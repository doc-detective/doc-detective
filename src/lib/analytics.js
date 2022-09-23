const { log } = require("./utils.js");
const axios = require("axios");

exports.sendAnalytics = sendAnalytics;

async function transformForGa(data) {
  let gaData = {
    client_id: "doc-detective",
    non_personalized_ads: true,
    events: [
      {
        name: "analytics_report",
        params: {
          engagement_time_msec: "",
          session_id: "",
        },
      },
    ],
  };
  // Transform to flat object
  if (
    data.detailLevel === "test" ||
    data.detailLevel === "action-simple" ||
    data.detailLevel === "action-detailed"
  ) {
    gaData.events[0].params.tests_numberTests = data.tests.numberTests;
    gaData.events[0].params.tests_passed = data.tests.passed;
    gaData.events[0].params.tests_failed = data.tests.failed;
    delete data.tests;
    if (
      data.detailLevel === "action-simple" ||
      data.detailLevel === "action-detailed"
    ) {
      gaData.events[0].params.actions_numberTests = data.actions.numberTests;
      gaData.events[0].params.actions_passed = data.actions.passed;
      gaData.events[0].params.actions_failed = data.actions.failed;
      gaData.events[0].params.actions_averageNumberActionsPerTest =
        data.actions.averageNumberActionsPerTest;
      gaData.events[0].params.actions_maxActionsPerTest =
        data.actions.maxActionsPerTest;
      gaData.events[0].params.actions_minActionsPerTest =
        data.actions.minActionsPerTest;
      delete data.actions;
      if (data.detailLevel === "action-detailed") {
        gaData.events[0].params.actionDetails_goTo_numberInstances =
          data.actionDetails.goTo.numberInstances;
        gaData.events[0].params.actionDetails_goTo_passed =
          data.actionDetails.goTo.passed;
        gaData.events[0].params.actionDetails_goTo_failed =
          data.actionDetails.goTo.failed;
        gaData.events[0].params.actionDetails_goTo_uri =
          data.actionDetails.goTo.uri;
        gaData.events[0].params.actionDetails_goTo_env =
          data.actionDetails.goTo.env;
        gaData.events[0].params.actionDetails_find_numberInstances =
          data.actionDetails.find.numberInstances;
        gaData.events[0].params.actionDetails_find_passed =
          data.actionDetails.find.passed;
        gaData.events[0].params.actionDetails_find_failed =
          data.actionDetails.find.failed;
        gaData.events[0].params.actionDetails_find_css =
          data.actionDetails.find.css;
        gaData.events[0].params.actionDetails_find_wait_numberInstances =
          data.actionDetails.find.wait.numberInstances;
        gaData.events[0].params.actionDetails_find_wait_duration =
          data.actionDetails.find.wait.duration;
        gaData.events[0].params.actionDetails_find_matchText_numberInstances =
          data.actionDetails.find.matchText.numberInstances;
        gaData.events[0].params.actionDetails_find_matchText_text =
          data.actionDetails.find.matchText.text;
        gaData.events[0].params.actionDetails_find_matchText_env =
          data.actionDetails.find.matchText.env;
        gaData.events[0].params.actionDetails_find_moveMouse_numberInstances =
          data.actionDetails.find.moveMouse.numberInstances;
        gaData.events[0].params.actionDetails_find_moveMouse_alignH =
          data.actionDetails.find.moveMouse.alignH;
        gaData.events[0].params.actionDetails_find_moveMouse_alignV =
          data.actionDetails.find.moveMouse.alignV;
        gaData.events[0].params.actionDetails_find_moveMouse_offsetX =
          data.actionDetails.find.moveMouse.offsetX;
        gaData.events[0].params.actionDetails_find_moveMouse_offsetY =
          data.actionDetails.find.moveMouse.offsetY;
        gaData.events[0].params.actionDetails_find_click_numberInstances =
          data.actionDetails.find.click.numberInstances;
        gaData.events[0].params.actionDetails_find_type_numberInstances =
          data.actionDetails.find.type.numberInstances;
        gaData.events[0].params.actionDetails_find_type_keys =
          data.actionDetails.find.type.keys;
        gaData.events[0].params.actionDetails_find_type_trailingSpecialKey =
          data.actionDetails.find.type.trailingSpecialKey;
        gaData.events[0].params.actionDetails_find_type_env =
          data.actionDetails.find.type.env;
        gaData.events[0].params.actionDetails_matchText_numberInstances =
          data.actionDetails.matchText.numberInstances;
        gaData.events[0].params.actionDetails_matchText_passed =
          data.actionDetails.matchText.passed;
        gaData.events[0].params.actionDetails_matchText_failed =
          data.actionDetails.matchText.failed;
        gaData.events[0].params.actionDetails_matchText_css =
          data.actionDetails.matchText.css;
        gaData.events[0].params.actionDetails_matchText_text =
          data.actionDetails.matchText.text;
        gaData.events[0].params.actionDetails_matchText_env =
          data.actionDetails.matchText.env;
        gaData.events[0].params.actionDetails_click_numberInstances =
          data.actionDetails.click.numberInstances;
        gaData.events[0].params.actionDetails_click_passed =
          data.actionDetails.click.passed;
        gaData.events[0].params.actionDetails_click_failed =
          data.actionDetails.click.failed;
        gaData.events[0].params.actionDetails_click_css =
          data.actionDetails.click.css;
        gaData.events[0].params.actionDetails_type_numberInstances =
          data.actionDetails.type.numberInstances;
        gaData.events[0].params.actionDetails_type_passed =
          data.actionDetails.type.passed;
        gaData.events[0].params.actionDetails_type_failed =
          data.actionDetails.type.failed;
        gaData.events[0].params.actionDetails_type_css =
          data.actionDetails.type.css;
        gaData.events[0].params.actionDetails_type_keys =
          data.actionDetails.type.keys;
        gaData.events[0].params.actionDetails_type_env =
          data.actionDetails.type.env;
        gaData.events[0].params.actionDetails_type_trailingSpecialKey =
          data.actionDetails.type.trailingSpecialKey;
        gaData.events[0].params.actionDetails_type_env =
          data.actionDetails.type.env;
        gaData.events[0].params.actionDetails_moveMouse_numberInstances =
          data.actionDetails.moveMouse.numberInstances;
        gaData.events[0].params.actionDetails_moveMouse_passed =
          data.actionDetails.moveMouse.passed;
        gaData.events[0].params.actionDetails_moveMouse_failed =
          data.actionDetails.moveMouse.failed;
        gaData.events[0].params.actionDetails_moveMouse_css =
          data.actionDetails.moveMouse.css;
        gaData.events[0].params.actionDetails_moveMouse_alignH =
          data.actionDetails.moveMouse.alignH;
        gaData.events[0].params.actionDetails_moveMouse_alignV =
          data.actionDetails.moveMouse.alignV;
        gaData.events[0].params.actionDetails_moveMouse_offsetX =
          data.actionDetails.moveMouse.offsetX;
        gaData.events[0].params.actionDetails_moveMouse_offsetY =
          data.actionDetails.moveMouse.offsetY;
        gaData.events[0].params.actionDetails_scroll_numberInstances =
          data.actionDetails.scroll.numberInstances;
        gaData.events[0].params.actionDetails_scroll_passed =
          data.actionDetails.scroll.passed;
        gaData.events[0].params.actionDetails_scroll_failed =
          data.actionDetails.scroll.failed;
        gaData.events[0].params.actionDetails_scroll_x =
          data.actionDetails.scroll.x;
        gaData.events[0].params.actionDetails_scroll_y =
          data.actionDetails.scroll.y;
        gaData.events[0].params.actionDetails_wait_numberInstances =
          data.actionDetails.wait.numberInstances;
        gaData.events[0].params.actionDetails_wait_passed =
          data.actionDetails.wait.passed;
        gaData.events[0].params.actionDetails_wait_failed =
          data.actionDetails.wait.failed;
        gaData.events[0].params.actionDetails_wait_duration =
          data.actionDetails.wait.duration;
        gaData.events[0].params.actionDetails_screenshot_numberInstances =
          data.actionDetails.screenshot.numberInstances;
        gaData.events[0].params.actionDetails_screenshot_passed =
          data.actionDetails.screenshot.passed;
        gaData.events[0].params.actionDetails_screenshot_failed =
          data.actionDetails.screenshot.failed;
        gaData.events[0].params.actionDetails_screenshot_mediaDirectory =
          data.actionDetails.screenshot.mediaDirectory;
        gaData.events[0].params.actionDetails_screenshot_filename =
          data.actionDetails.screenshot.filename;
        gaData.events[0].params.actionDetails_screenshot_matchPrevious =
          data.actionDetails.screenshot.matchPrevious;
        gaData.events[0].params.actionDetails_screenshot_matchThreshold =
          data.actionDetails.screenshot.matchThreshold;
        gaData.events[0].params.actionDetails_startRecording_numberInstances =
          data.actionDetails.startRecording.numberInstances;
        gaData.events[0].params.actionDetails_startRecording_passed =
          data.actionDetails.startRecording.passed;
        gaData.events[0].params.actionDetails_startRecording_failed =
          data.actionDetails.startRecording.failed;
        gaData.events[0].params.actionDetails_startRecording_mediaDirectory =
          data.actionDetails.startRecording.mediaDirectory;
        gaData.events[0].params.actionDetails_startRecording_filename =
          data.actionDetails.startRecording.filename;
        gaData.events[0].params.actionDetails_startRecording_gifFps =
          data.actionDetails.startRecording.gifFps;
        gaData.events[0].params.actionDetails_startRecording_gifWidth =
          data.actionDetails.startRecording.gifWidth;
        gaData.events[0].params.actionDetails_stopRecording_numberInstances =
          data.actionDetails.stopRecording.numberInstances;
        gaData.events[0].params.actionDetails_stopRecording_passed =
          data.actionDetails.stopRecording.passed;
        gaData.events[0].params.actionDetails_stopRecording_failed =
          data.actionDetails.stopRecording.failed;
        gaData.events[0].params.actionDetails_checkLink_numberInstances =
          data.actionDetails.checkLink.numberInstances;
        gaData.events[0].params.actionDetails_checkLink_passed =
          data.actionDetails.checkLink.passed;
        gaData.events[0].params.actionDetails_checkLink_failed =
          data.actionDetails.checkLink.failed;
        gaData.events[0].params.actionDetails_checkLink_uri =
          data.actionDetails.checkLink.uri;
        gaData.events[0].params.actionDetails_checkLink_statusCodes =
          data.actionDetails.checkLink.statusCodes;
        gaData.events[0].params.actionDetails_checkLink_env =
          data.actionDetails.checkLink.env;
        gaData.events[0].params.actionDetails_runShell_numberInstances =
          data.actionDetails.runShell.numberInstances;
        gaData.events[0].params.actionDetails_runShell_passed =
          data.actionDetails.runShell.passed;
        gaData.events[0].params.actionDetails_runShell_failed =
          data.actionDetails.runShell.failed;
        gaData.events[0].params.actionDetails_runShell_command =
          data.actionDetails.runShell.command;
        gaData.events[0].params.actionDetails_runShell_env =
          data.actionDetails.runShell.env;
        delete data.actionDetails;
      }
    }
  }

  return gaData;
}

async function sendAnalytics(config, results) {
  const packageJson = require("../../package.json");
  let data = {
    version: packageJson.version,
    detailLevel: config.analytics.detailLevel,
    userId: config.analytics.userId,
    tests: {
      numberTests: 0,
      passed: 0,
      failed: 0,
    },
    actions: {
      numberActions: 0,
      averageNumberActionsPerTest: 0,
      maxActionsPerTest: 0,
      minActionsPerTest: 0,
      passed: 0,
      failed: 0,
    },
    actionDetails: {
      goTo: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        uri: 0,
        env: 0,
      },
      find: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        wait: {
          numberInstances: 0,
          duration: 0,
        },
        matchText: {
          numberInstances: 0,
          text: 0,
          env: 0,
        },
        moveMouse: {
          numberInstances: 0,
          alignH: 0,
          alignV: 0,
          offsetX: 0,
          offsetY: 0,
        },
        click: {
          numberInstances: 0,
        },
        type: {
          numberInstances: 0,
          keys: 0,
          trailingSpecialKey: 0,
          env: 0,
        },
      },
      matchText: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        text: 0,
        env: 0,
      },
      click: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
      },
      type: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        keys: 0,
        trailingSpecialKey: 0,
        env: 0,
      },
      moveMouse: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        css: 0,
        alignH: 0,
        alignV: 0,
        offsetX: 0,
        offsetY: 0,
      },
      scroll: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        x: 0,
        y: 0,
      },
      wait: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        duration: 0,
        css: 0,
      },
      screenshot: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        mediaDirectory: 0,
        filename: 0,
        matchPrevious: 0,
        matchThreshold: 0,
      },
      startRecording: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        mediaDirectory: 0,
        filename: 0,
        gifFps: 0,
        gifWidth: 0,
      },
      stopRecording: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
      },
      checkLink: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        uri: 0,
        statusCodes: 0,
        env: 0,
      },
      runShell: {
        numberInstances: 0,
        passed: 0,
        failed: 0,
        command: 0,
        env: 0,
      },
    },
  };
  let actionsPerTest = [];

  // Preventatively remove unneeded sections based on detailLevel
  if (data.detailLevel === "run") {
    delete data.tests;
  } else if (data.detailLevel === "test") {
    delete data.actions;
  }

  // detailLeval: test
  if (
    data.detailLevel === "test" ||
    data.detailLevel === "action-simple" ||
    data.detailLevel === "action-detailed"
  ) {
    data.tests.numberTests = results.tests.length;
    results.tests.forEach((test) => {
      if (test.status === "PASS") data.tests.passed++;
      if (test.status === "FAIL") data.tests.failed++;

      // detailLevel: action
      if (
        data.detailLevel === "action-simple" ||
        data.detailLevel === "action-detailed"
      ) {
        actionsPerTest.push(test.actions.length);

        // loop through actions
        test.actions.forEach((action) => {
          if (action.result.status === "PASS") {
            data.actions.passed++;
            if (data.detailLevel === "action-detailed")
              data.actionDetails[action.action].passed++;
          }
          if (action.result.status === "FAIL") {
            data.actions.failed++;
            if (data.detailLevel === "action-detailed")
              data.actionDetails[action.action].failed++;
          }

          if (data.detailLevel === "action-detailed") {
            // loop through keys
            data.actionDetails[action.action].numberInstances++;
            Object.keys(action).forEach((key) => {
              if (key != "result" && key != "action" && key != "line") {
                if (typeof action[key] === "object") {
                  data.actionDetails[action.action][key].numberInstances++;
                  Object.keys(action[key]).forEach((key2) => {
                    data.actionDetails[action.action][key][key2]++;
                  });
                } else {
                  data.actionDetails[action.action][key]++;
                }
              }
            });
          }
        });
      }
    });
  }

  // Calculate actions per test numbers
  if (
    data.detailLevel === "action-simple" ||
    data.detailLevel === "action-detailed"
  ) {
    data.actions.numberActions = actionsPerTest.reduce((a, b) => a + b, 0);
    data.actions.averageNumberActionsPerTest =
      data.actions.numberActions / actionsPerTest.length;
    data.actions.maxActionsPerTest = actionsPerTest.reduce((a, b) =>
      Math.max(a, b)
    );
    data.actions.minActionsPerTest = actionsPerTest.reduce((a, b) =>
      Math.min(a, b)
    );
  }

  if (config.analytics.servers.length > 0) {
    config.analytics.servers.forEach(async (server) => {
      // Transform for GA
      if (server.name == "GA") data = await transformForGa(data);

      // Per-server validation
      server.displayname = server.name || server.url;
      if (!server.method) {
        log(
          config,
          "warning",
          `Can't send analytics to ${server.displayname}. Missing 'method' value.`
        );
        return;
      }
      if (!server.url) {
        log(
          config,
          "warning",
          `Can't send analytics to ${server.displayname}. Missing 'url' value.`
        );
        return;
      }

      // Construct request
      let req = {
        method: server.method,
        url: server.url,
        data,
      };
      if (server.params != undefined) req.params = server.params;
      if (server.headers != undefined) req.headers = server.headers;

      await axios(req)
        .then(() => {
          log(
            config,
            "debug",
            `Sucessfully sent analytics to ${server.displayname}.`
          );
        })
        .catch((error) => {
          log(
            config,
            "warning",
            `Problem sending analytics to ${server.displayname}.`
          );
        });
    });
  }
}
