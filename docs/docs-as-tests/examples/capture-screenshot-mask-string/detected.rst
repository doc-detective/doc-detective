Compare a screenshot with string masks
======================================

.. test {"testId":"capture-screenshot-mask-string","detectSteps":true}

#. Go to `the billing page <http://localhost:8092/mask.html>`_.

   .. step {"goTo":"http://localhost:8092/mask.html"}

#. The page shows the next invoice date and when the account last synced.

   .. step {"screenshot":{"path":"mask-string.png","directory":".dd-output","maxVariation":0.001,"overwrite":"aboveVariation","mask":["#clock","#stamps"]}}

.. test end
