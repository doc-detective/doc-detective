import { CopyBlock, nord } from "react-code-blocks";

const JSONBlock = (args) => {
    let text = "";

    // If args.pretty is true, return the object as a JSON string with 2 space indentation
    if (args.pretty) text = JSON.stringify(args.object, null, 2);
    // Else, return the object as a single-line JSON string
    else text = JSON.stringify(args.object);

    return (
        <div className="json-preview">
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

export default JSONBlock;