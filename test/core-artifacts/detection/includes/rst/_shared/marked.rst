.. step {"runShell": "node -e \"process.exit(1)\""}

.. START

.. step {"runShell": "node -e \"process.stdout.write('mark')\"", "variables": {"INC_RST_MARK": "$$stdio.stdout"}}

.. END

.. step {"runShell": "node -e \"process.exit(1)\""}
