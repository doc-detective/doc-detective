# Emulation steps (ADR 01232, ADR 01223) set the test's browser emulation
# instead of running. Each scenario checks what the page sees with inline
# statements, so it also runs with step detection off.
Feature: Emulation

  Scenario: An untagged scenario emulates in Chrome
    Given a 800x600 viewport
    And dark mode
    And the locale is "de-DE"
    And the timezone is "Europe/Berlin"
    # step {"goTo": "http://localhost:8092/index.html"}
    # step {"runBrowserScript": {"script": "return String(innerWidth === 800 && matchMedia('(prefers-color-scheme: dark)').matches && navigator.language === 'de-DE' && Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Berlin');", "output": "/^true$/"}}

  @firefox @headless
  Scenario: Light mode in Firefox
    Given light mode
    # step {"goTo": "http://localhost:8092/index.html"}
    # step {"runBrowserScript": {"script": "return String(matchMedia('(prefers-color-scheme: light)').matches);", "output": "/^true$/"}}

  @firefox @headless
  Scenario: Firefox can't set a timezone
    Given the timezone is "Europe/Berlin"
    # step {"goTo": "http://localhost:8092/index.html"}
