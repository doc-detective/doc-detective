Save the Node.js major version
==============================

#. Print the Node.js version:

   .. code-block:: shell

      node --version

#. Check that the major version is a number:

   .. code-block:: shell

      node -e "process.exit(/^[0-9]+$/.test(process.env.NODE_MAJOR) ? 0 : 1)"
