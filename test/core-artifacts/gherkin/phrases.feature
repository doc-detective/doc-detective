# Every phrase in the built-in Gherkin step vocabulary (ADR 01233), against the
# 8092 test server. run-feature.cjs runs this file with step detection on.
Feature: Step phrases

  Scenario: Navigate, find, and click
    Given I go to "http://localhost:8092/index.html"
    Then I see "Common HTML Elements"
    And I should see "Text Inputs"
    And I should not see "This text isn't on the page"
    When I click "Text Inputs"
    And I hover over "Standard Button"
    And I scroll to "Tables"
    And I swipe up
    Then the link "http://localhost:8092/index.html" works

  Scenario: Type and press keys
    Given I open "http://localhost:8092/type-echo.html"
    When I type "abc" into "#type-input"
    And I type "def"
    And I press "Enter"
    Then I should see "abcdef"

  Scenario: Drag and drop
    Given I go to "http://localhost:8092/drag-drop-test.html"
    When I drag "Table" to ".drop-zone[data-drop='zone1']"

  Scenario: Screenshots
    Given I go to "http://localhost:8092/index.html"
    Then I take a screenshot "page.png"
    And I take a screenshot of "header" as "header.png"

  Scenario: Shell, code, waits, and variables
    When I run "echo hello"
    And I run the command "node --version"
    And I run the script "node -p 1"
    And I run:
      """javascript
      console.log("hello from a doc string");
      """
    And I wait 0.2 seconds
    And I wait 100 milliseconds
    And the variables in "gherkin.env"

  Scenario: HTTP requests
    When I send a GET request to "http://localhost:8092/api/users"
    Then the response status should be 200
    When I send a POST request to "http://localhost:8092/api/users" with:
      """json
      {"name": "Ada"}
      """
    Then the response status is 200
    When I send a GET request to "http://localhost:8092/status/404"
    Then the response status should be 404

  @chrome @headless
  Scenario: Mock requests
    Given the API "GET **/api/mocked" returns:
      """
      mocked-body
      """
    And the API "**/api/from-file" returns "mock-body.txt"
    When I go to "http://localhost:8092/api/mocked"
    Then I should see "mocked-body"
    When I go to "http://localhost:8092/api/from-file"
    Then I should see "from-file"

  @chrome @headless
  Scenario: Recording and sessions
    Given I go to "http://localhost:8092/cookies/set/gherkin/yes"
    When I start recording "session.webm"
    And I save the session as "state.json"
    And I restore the session "state.json"
    And I stop recording
