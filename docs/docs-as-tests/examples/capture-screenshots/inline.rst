Take screenshots of a sign-in form
==================================

.. test {"testId":"capture-screenshots","detectSteps":false,"autoScreenshot":true,"annotationDefaults":{"color":"#E11D48","strokeWidth":3,"badge":{"background":"#E11D48","color":"#FFFFFF"}}}

#. Go to `the sample form <http://localhost:8092/enhanced-elements.html>`_.

   .. step {"goTo":"http://localhost:8092/enhanced-elements.html"}

#. The form opens.

   .. image:: .dd-output/capture-form.png
      :alt: The sample form
      :class: screenshot

   .. step {"screenshot":".dd-output/capture-form.png"}

#. Find the **Submit by ID** button at the top of the form.

   .. step {"screenshot":{"path":"capture-submit.png","directory":".dd-output","maxVariation":0.2,"overwrite":"aboveVariation","crop":{"elementText":"Submit by ID","padding":{"top":8,"right":16,"bottom":8,"left":16}}}}

#. Fill in the sign-in fields in the order the numbers show.

   .. step {"screenshot":{"path":"capture-sign-in.png","directory":".dd-output","overwrite":"true","crop":{"selector":"#inputs-section","padding":10},"annotations":[{"badge":"#username-input","label":"1","position":{"offset":{"x":-6,"y":0}}},{"badge":{"elementTestId":"password-field","timeout":10000},"label":"2"},{"callout":"#username-input","label":"Your account name","position":"right","style":{"maxWidth":200,"fontSize":14,"background":"#0F172A","padding":6}},{"outline":{"elementAttribute":{"data-validation":"email-validator"}},"style":{"color":"#7C3AED","radius":4,"opacity":0.8}},{"outline":"#inputs-section h2"},{"blur":"[data-testid=password-field]","style":{"intensity":12}},{"arrow":"#inputs-section h2","position":{"x":420,"y":30}},{"arrow":{"position":{"x":40,"y":20}}},{"text":"#username-input","label":"Required","position":"bottom"},{"text":{"position":"bottom-right"},"label":"Sample data"}]}}

.. test end
