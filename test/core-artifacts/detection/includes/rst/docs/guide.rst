Includes: reStructuredText
==========================

.. test {"testId": "includes-rst", "description": "rST include: whole file, start-after and end-before, start-line and end-line, a root-relative path, and an indented include (ADR 01212)."}

.. include:: _whole.rst

.. include:: ../_shared/marked.rst
   :start-after: .. START
   :end-before: .. END

.. include:: /_shared/lines.rst
   :start-line: 1
   :end-line: 2

.. note::

   .. include:: _indented.rst

.. step {"runShell": "node -e \"const e=process.env;process.exit(e.INC_RST_WHOLE==='whole'&&e.INC_RST_MARK==='mark'&&e.INC_RST_LINES==='lines'&&e.INC_RST_INDENT==='indent'?0:1)\""}

.. test end
