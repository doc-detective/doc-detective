import React, { useState } from 'react';
import { CopyBlock, nord } from "react-code-blocks";
import { Switch } from "@mui/material";

const JSONBlock = ({object, multiline}) => {
    // object: The object to display.

    // Set up state for multiline toggle.
    const [isMultiline, setMultiline] = useState(multiline);

    // Run custom logic.
    let text = "";
    // If multiline is true, return the object as a JSON string with 2 space indentation
    if (isMultiline) text = JSON.stringify(object, null, 2);
    // Else, return the object as a single-line JSON string
    else text = JSON.stringify(object);

    // Return the component.
    return (
        <div className="json-preview">
            <Switch
                checked={isMultiline}
                onChange={() => setMultiline(!isMultiline)}
                inputProps={{ 'aria-label': 'toggle multiline' }}
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