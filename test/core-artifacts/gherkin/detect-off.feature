# Step detection off for one test (ADR 01227): only inline `# step`
# statements run, and unmapped steps don't warn.
# test {"detectSteps": false}
Feature: Step detection off

  Scenario: Only inline steps run
    When I frobnicate, which nothing maps and nothing warns about
    And I run "echo not detected"
    # step {"runShell": "echo inline"}
