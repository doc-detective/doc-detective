import React, { useState } from 'react';
import config_v2 from 'doc-detective-common/src/schemas/output_schemas/config_v2.schema.json';
import validator from '@rjsf/validator-ajv8';
import Form from '@rjsf/mui';

const ConfigForm = () => {

    const uiSchema = {}

    return (
        <div>
            <Form
                schema={config_v2}
                uiSchema={uiSchema}
                validator={validator}
                onChange={log('changed')}
                onSubmit={log('submitted')}
                onError={log('errors')}
            />
        </div>
    );
};

export default ConfigForm;
