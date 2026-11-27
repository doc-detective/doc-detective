# Gherkin structure (ADR 01232): Background, Rule, Outline, data tables, and
# inline statements. When the fixture job runs this directory directly, with
# detection off, only the inline `# step` statements run.
@firefox @headless
Feature: Gherkin structure

  Background:
    Given I go to "http://localhost:8092/index.html"

  Scenario: Background runs first
    Then I should see "Common HTML Elements"

  # test {"testId": "merged-comment", "description": "A test comment merges into the scenario."}
  @id:ignored-by-the-comment
  Scenario: Merged test comment
    Then I see "Text Inputs"

  @id:by-tag
  Scenario: Tagged testId
    Then I see "Text Inputs"

  Scenario: Data tables
    Given I go to "http://localhost:8092/type-echo.html"
    When I fill in:
      | #type-input | typed from a table |
    Then I should see:
      | typed from a table  |
      | Type Echo Test Page |

  Scenario: Inline statements
    Then I see "Text Inputs"
    # test ignore start
    When I click "No such element"
    # test ignore end
    # step {"runShell": "echo inline step"}
    # test end

  Scenario Outline: Visit <page>
    Given I go to "http://localhost:8092/<page>"
    Then I should see "<heading>"

    Examples:
      | page       | heading              |
      | index.html | Common HTML Elements |

    @chrome
    Examples: Also in Chrome
      | page           | heading             |
      | type-echo.html | Type Echo Test Page |

  Rule: A Rule adds its own Background

    Background:
      Given I go to "http://localhost:8092/type-echo.html"

    Example: The Rule Background runs after the Feature Background
      Then I see "Type Echo Test Page"
