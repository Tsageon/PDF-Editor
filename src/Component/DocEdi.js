import React, { useState, useRef, useEffect, useCallback} from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { PDFDocument, rgb } from 'pdf-lib';

const useDebouncedCallback = (callback, delay) => {
    const timeoutRef = useRef();

useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);
    
    return (...args) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => callback(...args), delay);
     };
};

const DocumentEditor = () => {
    // PDF states
    const [fileUrl, setFileUrl] = useState(null);
    const [pdfBytes, setPdfBytes] = useState(null);
    const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
    const [containerHeight, setContainerHeight] = useState(0);
    const [textInputs, setTextInputs] = useState([]);
    const [signatureData, setSignatureData] = useState(null);
    const [signaturePosition, setSignaturePosition] = useState({ x: 50, y: 50 });

    // Refs
    const previewContainerRef = useRef(null);
    const sigPadRef = useRef(null);

    // Undo/redo functionality
    const [history, setHistory] = useState([]);
    const [currentStep, setCurrentStep] = useState(-1);
    const [tempState, setTempState] = useState(null);
    const [interactionMode, setInteractionMode] = useState('edit');

    const iframeRef = useRef(null);

    useEffect(() => {
        if (tempState) {
            setHistory(prev => [...prev.slice(0, currentStep + 1), tempState]);
            setCurrentStep(prev => prev + 1);
            setTempState(null);
        }
    }, [textInputs, signatureData, signaturePosition, tempState]);

    useEffect(() => {
        if (interactionMode === 'edit' && textInputs.length > 0) {
          const lastInput = document.getElementById(`input-${textInputs[textInputs.length - 1].id}`);
          lastInput?.focus();
        }
      });
      // Add this useEffect to handle form field focus
      const handleIframeLoad = useCallback(() => {
        if (interactionMode === 'interact' && iframeRef.current) {
          const iframeDoc = iframeRef.current.contentDocument;
          iframeDoc?.querySelectorAll('input, select, textarea').forEach(element => {
            element.style.pointerEvents = 'auto';
            element.style.zIndex = '9999'; // Force higher z-index for PDF elements
          });
        }
      }, [interactionMode]);
    const pendingChanges = useRef(false);

    const updateState = (updateFn) => {
        if (!pendingChanges.current) {
            setTempState({
                textInputs: [...textInputs],
                signatureData,
                signaturePosition
            });
            pendingChanges.current = true;
        }

        updateFn();
    };

    useEffect(() => {
        if (tempState && pendingChanges.current) {
            setHistory(prev => [...prev.slice(0, currentStep + 1), tempState]);
            setCurrentStep(prev => prev + 1);
            setTempState(null);
            pendingChanges.current = false;
        }
    }, [tempState]);

    const handleUndo = () => {
        if (currentStep > 0) {
            const previousState = history[currentStep - 1];
            setCurrentStep(prev => prev - 1);
            applyState(previousState);
        }
    };

    // Redo functionality
    const handleRedo = () => {
        if (currentStep < history.length - 1) {
            const nextState = history[currentStep + 1];
            setCurrentStep(prev => prev + 1);
            applyState(nextState);
        }
    };

    // Apply state from history
    const applyState = useCallback((state) => {
        setTextInputs([...state.textInputs]);
        setSignatureData(state.signatureData);
        setSignaturePosition(state.signaturePosition);
      }, []);

    // Delete individual text input
    const deleteTextInput = (id) => {
        updateState(() => {
            setTextInputs(prev => prev.filter(input => input.id !== id));
        }, 'text');
    };

    // // Remove signature
    // const removeSignature = () => {
    //     updateState(() => {
    //         setSignatureData(null);
    //         setSignaturePosition({ x: 50, y: 50 });
    //     }, 'signature');
    // };

    // Clear all inputs and signature
    const clearAll = () => {
        updateState(() => {
            setTextInputs([]);
            setSignatureData(null);
            setSignaturePosition({ x: 50, y: 50 });
            if (sigPadRef.current) sigPadRef.current.clear();
        }, 'all');
    };

    // Handle PDF file upload
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }
        setHistory([]);
        setCurrentStep(-1);
        setTempState(null);
        try {
            const arrayBuffer = await file.arrayBuffer();
            setPdfBytes(arrayBuffer);
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            setFileUrl(URL.createObjectURL(blob));

            // Load PDF via pdf-lib to get native page dimensions
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const firstPage = pdfDoc.getPages()[0];
            const { width, height } = firstPage.getSize();
            setPageDimensions({ width, height });

            // Once the file is loaded, update the preview container's height
            // We wait a tick to let previewContainerRef get its width.
            setTimeout(() => {
                if (previewContainerRef.current) {
                    const containerWidth = previewContainerRef.current.offsetWidth;
                    // Maintain the PDF's aspect ratio:
                    setContainerHeight((height / width) * containerWidth);
                }
            }, 0);
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Failed to load PDF');
        }
    };

    // On clicking the preview, add a new text input overlay.
    const handlePreviewClick = (e) => {
        if (!previewContainerRef.current) return;

        updateState(() => {
            const rect = previewContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setTextInputs(prev => [...prev, { id: Date.now(), x, y, value: '' }]);
        });
    };

    const handleTextChange = useDebouncedCallback((id, value) => {
        updateState(() => {
            setTextInputs(prev =>
                prev.map(input => input.id === id ? { ...input, value } : input)
            );
        });
    }, 300);

    // Drag the signature overlay.
    const handleSignatureMouseDown = (e) => {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const initPos = { ...signaturePosition };

      // Update the mouse move handler
const handleMouseMove = (moveEvent) => {
    const container = previewContainerRef.current.getBoundingClientRect();
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    
    // Calculate boundaries with 10px buffer
    const maxX = container.width - 160; 
    const maxY = container.height - 60;
    
    setSignaturePosition({
      x: Math.max(10, Math.min(initPos.x + dx, maxX)),
      y: Math.max(10, Math.min(initPos.y + dy, maxY))
    });
  };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Capture signature from the signature pad.
    const handleCaptureSignature = () => {
        if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
            alert('Please draw a signature first!');
            return;
        }
        // Use full canvas image (or use getTrimmedCanvas if you prefer)
        const dataUrl = sigPadRef.current.toDataURL('image/png');
        setSignatureData(dataUrl);
        // Optionally reset position (or leave it as is if already moved)
        setSignaturePosition({ x: 50, y: 50 });
    };

    // Convert screen (overlay) coordinates to PDF coordinates.
    const convertToPdfCoordinates = (x, y) => {
        const containerWidth = previewContainerRef.current.offsetWidth;
        const containerHeight = previewContainerRef.current.offsetHeight;
        return {
            x: (x / containerWidth) * pageDimensions.width,
            y: pageDimensions.height - ((y / containerHeight) * pageDimensions.height)
        };
    };

    // Save the PDF: embed signature and text inputs.
    const handleSavePdf = async () => {
        if (!pdfBytes) {
            alert('No PDF loaded.');
            return;
        }
        try {
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const firstPage = pdfDoc.getPages()[0];

            // Embed signature if available.
            if (signatureData) {
                const pngImage = await pdfDoc.embedPng(signatureData);
                const { x: sigPdfX, y: sigPdfY } = convertToPdfCoordinates(
                    signaturePosition.x,
                    signaturePosition.y
                );
                firstPage.drawImage(pngImage, {
                    x: sigPdfX,
                    y: sigPdfY - (pngImage.height * (150 / pngImage.width)),
                    width: 150,
                    height: pngImage.height * (150 / pngImage.width)
                });
            }

            // Embed each text input.
            textInputs.forEach(({ x, y, value }) => {
                if (!value.trim()) return;
                const { x: pdfX, y: pdfY } = convertToPdfCoordinates(x, y);
                firstPage.drawText(value, {
                    x: pdfX,
                    y: pdfY,
                    size: 18,
                    color: rgb(0, 0, 0)
                });
            });

            const modifiedPdfBytes = await pdfDoc.save();
            downloadPdf(modifiedPdfBytes);
        } catch (error) {
            console.error('Error saving PDF:', error);
            alert('Failed to save PDF');
        }
    };

    const downloadPdf = (bytes) => {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `edited-document-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const controlButtonStyle = {
        padding: '0.75rem 1.5rem',
        backgroundColor: '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        ':disabled': {
            backgroundColor: '#cccccc',
            cursor: 'not-allowed'
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1>Document Editor</h1>

            {/* File Upload */}
            <div style={{ marginBottom: '2rem' }}>
                <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    style={{
                        padding: '0.5rem',
                        border: '2px solid #007bff',
                        borderRadius: '4px'
                    }}
                />
            </div>

            {/* PDF Preview Area */}
            {fileUrl && (
                <div
                    ref={previewContainerRef}
                    style={{
                        position: 'relative',
                        margin: '2rem 0',
                        width: '100%',
                        height: containerHeight, // computed height for correct aspect ratio
                        border: '2px solid #666',
                        overflow: 'hidden',
                        cursor: 'text',
                         pointerEvents: interactionMode === 'edit' ? 'auto' : 'none'
                    }}
                    onClick={(e) => {
                        // Only handle clicks directly on the container
                        if (e.target === e.currentTarget) {
                            handlePreviewClick(e);
                        }
                    }}
                >
                    <iframe
                        src={fileUrl}
                        width="100%"
                        height="100%"
                        title="PDF Preview"
                        onLoad={handleIframeLoad}
                        style={{
                            border: 'none',
                           zIndex: interactionMode === 'edit' ? 0 : 2, // Lower z-index in interact mode
                            pointerEvents: interactionMode === 'edit' ? 'none' : 'auto'
                        }}
                        ref={iframeRef}
                    />


                    {/* Render text inputs on top */}
                 
                    {textInputs.map(({ id, x, y, value }) => (
                        <div
                            key={id}
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px', 
                                zIndex: interactionMode === 'edit' ? 3 : 1 ,
                                pointerEvents: interactionMode === 'edit' ? 'auto' : 'none'
                            }}
                        >
                            <input
                                type="text"
                                value={value}
                                onChange={(e) => {
                                    // Immediate update for local input
                                    const newValue = e.target.value;
                                    setTextInputs(prev =>
                                        prev.map(input => input.id === id ? { ...input, value: newValue } : input)
                                    );
                                    // Debounced update for undo history
                                    handleTextChange(id, newValue);
                                }}
                                style={{
                                    background: 'rgba(255,255,255,0.9)',
                                    border: '2px solid #007bff',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    fontSize: '16px',
                                    outline: 'none',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <button
                                onClick={() => deleteTextInput(id)}
                                style={{
                                    background: '#dc3545',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '24px',
                                    height: '24px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                            </button>
                            <div style={{ margin: '1rem 0', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button
                            onClick={handleUndo}
                            disabled={currentStep <= 0}
                            style={controlButtonStyle}
                        >
                            Undo
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={currentStep >= history.length - 1}
                            style={controlButtonStyle}
                        >
                            Redo
                        </button>
                        <button
                            onClick={clearAll}
                            style={{ ...controlButtonStyle, backgroundColor: '#ffc107' }}
                        >
                            Clear All
                        </button>
                        <button
                            onClick={() => setInteractionMode(prev =>
                                prev === 'edit' ? 'interact' : 'edit'
                            )}
                            style={{
                                ...controlButtonStyle,
                                backgroundColor: interactionMode === 'edit' ? '#007bff' : '#28a745'
                            }}
                        >
                            {interactionMode === 'edit'
                                ? 'Switch to PDF Interaction'
                                : 'Switch to Edit Mode'}
                        </button>
                    </div>
                        </div>
                    ))}

                    {/* Draggable Signature Overlay */}
                    {signatureData && (
                        <img
                            src={signatureData}
                            alt="Signature"
                            style={{
                                position: 'absolute',
                                left: signaturePosition.x,
                                top: signaturePosition.y,
                                width: '150px',
                                cursor: 'move',
                                zIndex: interactionMode === 'edit' ? 3 : 1,
                                pointerEvents: interactionMode === 'edit' ? 'auto' : 'none'
                            }}
                            onMouseDown={handleSignatureMouseDown}
                        />
                    )}
                </div>
            )}

            {/* Signature Pad */}
            <div style={{ margin: '2rem 0', padding: '1rem', border: '2px solid #ccc', borderRadius: '8px' }}>
                <h2>Draw Your Signature</h2>
                <SignatureCanvas
                    penColor="black"
                    canvasProps={{
                        width: 500,
                        height: 200,
                        style: { border: '0.2rem solid #000', background: '#fff', borderRadius: '0.4rem' }
                    }}
                    ref={sigPadRef}
                />
                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button
                        onClick={() => sigPadRef.current?.clear()}
                        style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Clear Signature
                    </button>
                    <button
                        onClick={handleCaptureSignature}
                        style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Capture Signature
                    </button>
                </div>
            </div>

            {/* Save PDF Button */}
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button
                    onClick={handleSavePdf}
                    style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        opacity: !pdfBytes ? 0.5 : 1
                    }}
                    disabled={!pdfBytes}
                >
                    Save PDF
                </button>
            </div>
        </div>
    );
};

export default DocumentEditor;