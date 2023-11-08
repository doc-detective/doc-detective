import React, { useState } from 'react';
import { CopyBlock, nord } from "react-code-blocks";
import { Switch, FormControlLabel } from "@mui/material";

const JSONBlock = ({object, multiline}) => {
    // object: The object to display.

    // Set up state for multiline toggle.
    const [isMultiline, setMultiline] = useState(multiline);

    // Run custom logic.
    const text = isMultiline ? JSON.stringify(object, null, 2) : JSON.stringify(object);

    // Return the component.
    return (
        <div className="json-preview">
            <FormControlLabel
                labelPlacement="start"
                label="Multiline"
                control={
                    <Switch
                        checked={isMultiline}
                        onChange={() => setMultiline(!isMultiline)}
                        inputProps={{ 'aria-label': 'toggle multiline' }}
                    />
                }
            />
            <CopyBlock
                text={text}
                language="json"
                showLineNumbers={true}
                theme={nord}
                wrapLines={true}
                codeBlock
            />
        </div>
    );
}

// Default props.
JSONBlock.defaultProps = {
    object: {},
    multiline: true,
}

// Export the component.
export default JSONBlock;