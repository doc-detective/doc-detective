Save the Node.js version
========================

#. Print the Node.js version:

   .. code-block:: shell

      node --version

#. Check that the saved version starts with ``v``:

   .. code-block:: shell

      node -e "process.exit(process.env.NODE_VERSION.startsWith('v') ? 0 : 1)"
