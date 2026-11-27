# Warnings (ADR 01232): an unmapped step warns and the rest of the scenario
# still runs, an Outline with no Examples warns and emits no test, and a
# scenario with no steps emits no test.
Feature: Warnings

  Scenario: An unmapped step warns
    When I run "echo before"
    And I frobnicate the widget
    Then I run "echo after"

  Scenario Outline: No examples
    When I run "echo <value>"

  Scenario: No steps
