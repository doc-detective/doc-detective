Run a tool only where it's installed
====================================

.. test {"testId":"sessions-runon-requires-unmet","detectSteps":false,"runOn":[{"platforms":["linux","mac"],"requires":{"commands":["sessions-missing-tool"],"env":["PATH"]}}]}

#. Run ``sessions-missing-tool --version``.

   .. step {"runShell":"sessions-missing-tool --version"}

.. test end
