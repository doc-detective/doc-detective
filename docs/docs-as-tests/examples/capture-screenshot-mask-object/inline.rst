Compare a screenshot with an element mask
=========================================

.. test {"testId":"capture-screenshot-mask-object","detectSteps":false}

#. Go to `the billing page <http://localhost:8092/mask.html>`_.

   .. step {"goTo":"http://localhost:8092/mask.html"}

#. The page shows the next invoice date and when the account last synced.

   .. step {"screenshot":{"path":"mask-object.png","directory":".dd-output","maxVariation":0.001,"overwrite":"aboveVariation","mask":[{"selector":".stamp"},"#clock"]}}

.. test end
