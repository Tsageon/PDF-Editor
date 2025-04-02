import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric  from 'fabric';
import * as pdfjs from 'pdfjs-dist/webpack';
import { GlobalWorkerOptions } from "pdfjs-dist";
import { PDFDocument } from 'pdf-lib';

const PDFEditor = () => {
  const canvasRef = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  GlobalWorkerOptions.workerSrc = `public/pdfjs/pdf.worker.mjs`;


  useEffect(() => {
    const initCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 1000,
      selection: true,
      preserveObjectStacking: true,
    });
    setCanvas(initCanvas);

    return () => initCanvas.dispose();
  }, []);

  useEffect(() => {
    if (canvas) {
      fabric.Image.fromURL("https://via.placeholder.com/800x1000.png", (img) => {
        console.log("Fabric image loaded:", img);
        img.set({
          scaleX: canvas.width / img.width,
          scaleY: canvas.height / img.height,
          left: 0,
          top: 0,
          selectable: false,
          evented: false
        });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
      }, { crossOrigin: 'anonymous' });
    }
  }, [canvas]);
   


  const convertPdfToImage = async (file) => {
    if (!file) return null;
    
    setIsLoading(true);
    try {
      console.log("Reading PDF file as arrayBuffer...");
      const arrayBuffer = await file.arrayBuffer();
      console.log("Loading PDF document...");
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      console.log("Getting first page...");
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 1.5 });
      console.log("Viewport dimensions:", viewport.width, viewport.height);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = viewport.width;
      tempCanvas.height = viewport.height;
      
      console.log("Rendering PDF page...");
      await page.render({
        canvasContext: tempCanvas.getContext('2d'),
        viewport
      }).promise;
      
      const dataUrl = tempCanvas.toDataURL('image/png');
      console.log("Image conversion completed.");
      return dataUrl;
    } catch (error) {
      console.error('PDF conversion error:', error);
      alert('Failed to process PDF');
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  

  // Handle PDF file upload
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    console.log("File uploaded:", file);
    if (!file) return;
    
    setPdfFile(file);
    console.log("File uploaded:", file);
    const imageUrl = await convertPdfToImage(file);
    console.log("Generated image URL:", imageUrl);
    if (imageUrl && canvas) {
      loadBackground(imageUrl);
    }
  };

  const loadBackground = useCallback((url) => {
    console.log("loadBackground triggered with URL:", url);
    if (!canvas || !url) return;

    fabric.Image.fromURL(url, (img) => {
      if (!img) return;
      
      const scale = Math.min(
        canvas.width / img.width,
        canvas.height / img.height
      );
      
      img.set({
        scaleX: scale,
        scaleY: scale,
        left: (canvas.width - img.width * scale) / 2,
        top: (canvas.height - img.height * scale) / 2,
        selectable: false,
        evented: false
      });

      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
    }, { crossOrigin: 'anonymous' });
  }, [canvas]);

  // Add text element
  const addText = useCallback(() => {
    if (!canvas) return;

    const text = new fabric.IText('Edit text', {
      left: 100,
      top: 100,
      fontFamily: 'Arial',
      fontSize: 24,
      fill: '#000',
      padding: 10,
      backgroundColor: 'rgba(255,255,255,0.7)',
      editable: true,
    });
    
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
  }, [canvas]);

  // Add signature
  const addSignature = useCallback(() => {
    if (!canvas) return;

    const signature = new fabric.Rect({
      width: 150,
      height: 50,
      left: 200,
      top: 200,
      fill: 'transparent',
      stroke: '#000',
      strokeWidth: 2,
      rx: 5,
      ry: 5,
    });
    
    const text = new fabric.Text('Signature', {
      left: 225,
      top: 215,
      fontSize: 16,
      fill: '#000',
    });
    
    const group = new fabric.Group([signature, text], {
      left: 200,
      top: 200,
    });
    
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
  }, [canvas]);

  // Save as PDF
  const saveAsPdf = useCallback(async () => {
    if (!canvas || !pdfFile) return;

    setIsLoading(true);
    try {
      // Get canvas as image
      const canvasImage = canvas.toDataURL({
        format: 'png',
        quality: 1,
      });

      // Load original PDF
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const page = pdfDoc.getPage(0);
      
      // Embed canvas image
      const pngImage = await pdfDoc.embedPng(canvasImage);
      const { width, height } = page.getSize();
      
      // Draw canvas image over the PDF
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width,
        height,
        opacity: 1,
      });

      // Save and download
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `edited_${pdfFile.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert('Failed to save PDF');
    } finally {
      setIsLoading(false);
    }
  }, [canvas, pdfFile]);

  const testPdfRead = async (file) => {
    const buffer = await file.arrayBuffer();
    console.log("PDF file size:", buffer.byteLength);
  };
  

  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>PDF Editor</h1>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="file"
            accept="application/pdf"
            onChange={testPdfRead}
            style={{ 
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={addText}
            disabled={!canvas || isLoading || !pdfFile}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: (!canvas || isLoading || !pdfFile) ? 0.6 : 1
            }}
          >
            Add Text
          </button>
          <button 
            onClick={addSignature}
            disabled={!canvas || isLoading || !pdfFile}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: (!canvas || isLoading || !pdfFile) ? 0.6 : 1
            }}
          >
            Add Signature
          </button>
          <button 
            onClick={saveAsPdf}
            disabled={!canvas || isLoading || !pdfFile}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#F44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: (!canvas || isLoading || !pdfFile) ? 0.6 : 1
            }}
          >
            {isLoading ? 'Processing...' : 'Save PDF'}
          </button>
        </div>
      </div>

      <div style={{ 
        border: '1px solid #ddd',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        minHeight: '1000px'
      }}>
        <canvas 
          ref={canvasRef} 
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
};

export default PDFEditor;