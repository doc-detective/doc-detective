# Tags (ADR 01235): skip tags, browser and platform tags, @headless, and
# @record. Platform-tagged scenarios are SKIPPED on other hosts.
Feature: Tags

  @skip
  Scenario: Skipped with skip
    Given I go to "http://localhost:8092/index.html"

  @wip
  Scenario: Skipped with wip
    Given I go to "http://localhost:8092/index.html"

  @chrome @headless @record
  Scenario: Recorded automatically
    Given I go to "http://localhost:8092/index.html"
    Then I see "Common HTML Elements"

  @firefox @headless
  Scenario: Firefox
    Given I go to "http://localhost:8092/index.html"
    Then I see "Common HTML Elements"

  @linux
  Scenario: Linux only
    When I run "echo linux"

  @windows @mac
  Scenario: Windows and macOS only
    When I run "echo windows or mac"

  @safari @mac
  Scenario: Safari on macOS
    Given I go to "http://localhost:8092/index.html"
    Then I see "Common HTML Elements"
