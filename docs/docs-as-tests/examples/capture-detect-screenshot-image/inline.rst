Mark an image as a screenshot
=============================

.. test {"testId":"capture-detect-screenshot-image","detectSteps":false}

#. Go to `the banner page <http://localhost:8092/screenshot-banner.html>`_.

   .. step {"goTo":"http://localhost:8092/screenshot-banner.html"}

#. The page opens with a cookie banner at the bottom.

   .. image:: .dd-output/detected-banner.png
      :alt: The banner page
      :class: screenshot

   .. step {"screenshot":".dd-output/detected-banner.png"}

.. test end
