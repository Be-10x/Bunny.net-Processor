import React, { useState, useRef, useEffect } from 'react';
import { AppState, ProcessorState, BunnyConfig, BunnyStatus } from './types';
import { generateChapters, cleanCaptions } from './services/geminiService';
import { updateBunnyChapters, BUNNY_LIBRARIES } from './services/bunnyService';
import { CheckCircleIcon, DocumentTextIcon, SpinnerIcon, DownloadIcon, MagicWandIcon, UploadIcon, ClipboardIcon } from './components/Icon';

const App: React.FC = () => {
  const [state, setState] = useState<ProcessorState>({
    file: null,
    fileContent: null,
    status: AppState.IDLE,
    errorMessage: null,
    chapterResult: null,
    captionResult: null,
  });

  // Bunny.net State
  const [bunnyConfig, setBunnyConfig] = useState<BunnyConfig>({ apiKey: '', libraryId: '', videoId: '' });
  const [bunnyStatus, setBunnyStatus] = useState<BunnyStatus>(BunnyStatus.IDLE);
  const [bunnyError, setBunnyError] = useState<string | null>(null);
  const [editableCsv, setEditableCsv] = useState<string>('');
  const [selectedLibraryName, setSelectedLibraryName] = useState<string>('');
  
  // Progress Bar State
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAction, setPendingAction] = useState<'chapters' | 'captions' | null>(null);

  // Sync CSV content when result changes
  useEffect(() => {
    if (state.chapterResult?.csvContent) {
      setEditableCsv(state.chapterResult.csvContent);
    }
  }, [state.chapterResult]);

  // Simulated Progress Logic
  useEffect(() => {
    if (state.status === AppState.PROCESSING_CHAPTERS || state.status === AppState.PROCESSING_CAPTIONS) {
      setProgress(0);
      setProgressMessage('Initializing AI...');
      
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95;
          // Slower progress as it gets higher
          const increment = prev < 50 ? 5 : prev < 80 ? 2 : 0.5;
          return prev + increment;
        });
      }, 500);

      const msgInterval = setInterval(() => {
        const msgs = state.status === AppState.PROCESSING_CHAPTERS 
          ? ['Analyzing transcript...', 'Extracting key topics...', 'Formatting timestamps...', 'Finalizing CSV...']
          : ['Reading file...', 'Removing filler words...', 'Fixing punctuation...', 'Formatting SRT...'];
        
        setProgressMessage(prev => {
          const idx = msgs.indexOf(prev);
          return msgs[(idx + 1) % msgs.length];
        });
      }, 3000);

      return () => {
        clearInterval(interval);
        clearInterval(msgInterval);
      };
    } else if (state.status === AppState.COMPLETED) {
      setProgress(100);
      setProgressMessage('Complete!');
    }
  }, [state.status]);

  // File Upload Handling
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPendingAction(null);
      return;
    }

    if (!file.name.endsWith('.vtt') && !file.name.endsWith('.srt') && !file.name.endsWith('.txt')) {
      setState(prev => ({ ...prev, errorMessage: "Please upload a valid transcript file (.vtt, .srt, or .txt)" }));
      setPendingAction(null);
      return;
    }

    try {
      const text = await file.text();
      const newState = {
        file,
        fileContent: text,
        status: AppState.IDLE,
        errorMessage: null,
        chapterResult: null,
        captionResult: null
      };
      setState(newState);
      setBunnyStatus(BunnyStatus.IDLE); // Reset bunny status
      setBunnyError(null);

      if (pendingAction === 'chapters') {
        executeGenerateChapters(text);
      } else if (pendingAction === 'captions') {
        executeCleanCaptions(text);
      }
      setPendingAction(null);

    } catch (err) {
      setState(prev => ({ ...prev, errorMessage: "Failed to read file contents." }));
      setPendingAction(null);
    }
  };

  const triggerUpload = (action: 'chapters' | 'captions') => {
    setPendingAction(action);
    fileInputRef.current?.click();
  };

  const resetState = () => {
    setState({
      file: null,
      fileContent: null,
      status: AppState.IDLE,
      errorMessage: null,
      chapterResult: null,
      captionResult: null,
    });
    setBunnyStatus(BunnyStatus.IDLE);
    setBunnyError(null);
    setEditableCsv('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeGenerateChapters = async (content: string) => {
    setState(prev => ({ ...prev, fileContent: content, status: AppState.PROCESSING_CHAPTERS, errorMessage: null }));
    try {
      const result = await generateChapters(content);
      setState(prev => ({ ...prev, status: AppState.COMPLETED, chapterResult: result }));
    } catch (error: any) {
      setState(prev => ({ ...prev, status: AppState.ERROR, errorMessage: error.message || "Error generating chapters." }));
    }
  };

  const executeCleanCaptions = async (content: string) => {
    setState(prev => ({ ...prev, fileContent: content, status: AppState.PROCESSING_CAPTIONS, errorMessage: null }));
    try {
      const result = await cleanCaptions(content);
      setState(prev => ({ ...prev, status: AppState.COMPLETED, captionResult: result }));
    } catch (error: any) {
      setState(prev => ({ ...prev, status: AppState.ERROR, errorMessage: error.message || "Error cleaning captions." }));
    }
  };

  const handleChapterClick = () => {
    if (state.fileContent) {
      executeGenerateChapters(state.fileContent);
    } else {
      triggerUpload('chapters');
    }
  };

  const handleCaptionClick = () => {
    if (state.fileContent) {
      executeCleanCaptions(state.fileContent);
    } else {
      triggerUpload('captions');
    }
  };

  const downloadFile = (content: string, suffix: string, type: 'csv' | 'srt') => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.file?.name.split('.')[0]}_${suffix}.${type}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy: ', err);
    });
  };

  // --- Bunny.net Handlers ---

  const handleLibraryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const libName = e.target.value;
    setSelectedLibraryName(libName);

    const selectedLib = BUNNY_LIBRARIES.find(lib => lib.name === libName);
    
    if (selectedLib) {
      setBunnyConfig(prev => ({
        ...prev,
        libraryId: selectedLib.id // Will be empty string if not set in code
      }));
      setBunnyError(null);
    } else {
      setBunnyConfig(prev => ({ ...prev, libraryId: '' }));
    }
  };

  const handleBunnyConfigChange = (field: keyof BunnyConfig, value: string) => {
    setBunnyConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleBunnyUpdate = async () => {
    // 1. Validations
    if (!bunnyConfig.videoId || !bunnyConfig.videoId.trim()) {
      setBunnyError("Please enter the Video GUID.");
      return;
    }

    if (!selectedLibraryName) {
       setBunnyError("Please select a Library.");
       return;
    }

    if (!bunnyConfig.libraryId || !bunnyConfig.libraryId.trim()) {
      setBunnyError(`Library ID is missing. Please select a library with a valid ID or enter it manually.`);
      return;
    }
    
    if (!editableCsv || !editableCsv.trim()) {
      setBunnyError("No chapter data to upload.");
      return;
    }

    // 2. Start Process
    setBunnyStatus(BunnyStatus.UPLOADING);
    setBunnyError(null);

    try {
      // Note: We don't pass an API key here. The backend handles it.
      await updateBunnyChapters(
        '', 
        bunnyConfig.libraryId.trim(), 
        bunnyConfig.videoId.trim(), 
        editableCsv
      );
      setBunnyStatus(BunnyStatus.SUCCESS);
    } catch (e: any) {
      console.error("Bunny Update Caught Error:", e);
      setBunnyStatus(BunnyStatus.ERROR);
      setBunnyError(e.message);
    }
  };

  // Check if the selected library has a hardcoded ID
  const isIdHardcoded = React.useMemo(() => {
    const lib = BUNNY_LIBRARIES.find(l => l.name === selectedLibraryName);
    return lib && lib.id !== "";
  }, [selectedLibraryName]);

  const envVarHint = React.useMemo(() => {
    if (!bunnyConfig.libraryId) return null;
    const cleanId = bunnyConfig.libraryId.trim();
    return `BUNNY_KEY_NAME_${cleanId} OR BUNNY_API_KEY`;
  }, [bunnyConfig.libraryId]);

  return (
    <div className="min-h-screen font-sans bg-slate-50 text-slate-800">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".vtt,.srt,.txt"
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-brand-200">
              Ed
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Bunny.net Processor</h1>
            </div>
          </div>
          
          {state.file && (
             <div className="flex items-center bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <DocumentTextIcon />
                <span className="text-xs font-medium text-slate-600 ml-2 mr-3 truncate max-w-[150px]">
                  {state.file.name}
                </span>
                <button onClick={resetState} className="text-xs text-red-500 hover:text-red-700 font-bold px-2 border-l border-slate-300">
                  CLEAR
                </button>
             </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        
        {/* Error Notification */}
        {state.errorMessage && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r shadow-sm animate-fade-in">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700 font-medium">Error Occurred</p>
                <p className="text-sm text-red-600 mt-1">{state.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 1: CONTENT PROCESSING */}
        <section className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white text-slate-500 font-bold text-lg flex items-center justify-center border-2 border-slate-200 shadow-sm">
              1
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Process Transcript</h2>
              <p className="text-slate-500 text-sm mt-1">Upload your file to generate chapters or clean captions.</p>
            </div>
          </div>

          <div className="pl-0 md:pl-14">
            {/* Main Tool Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                
                {/* Chapters Card */}
                <div className={`relative bg-white rounded-2xl border transition-all duration-300 flex flex-col overflow-hidden group
                  ${state.status === AppState.PROCESSING_CHAPTERS ? 'ring-2 ring-purple-500 border-transparent' : 'border-slate-200 hover:shadow-xl hover:-translate-y-1'}
                `}>
                  <div className="h-2 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
                  <div className="p-8 flex-grow">
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-6">
                      <MagicWandIcon />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Generate Chapters</h3>
                    <p className="text-slate-500 leading-relaxed mb-6">
                      Analyzes long transcripts (2h+) to extract key topics. Automatically formats output for Bunny.net CSV upload.
                    </p>
                    
                    {/* Progress Bar for Chapters */}
                    {state.status === AppState.PROCESSING_CHAPTERS && (
                      <div className="mb-6">
                        <div className="flex justify-between text-xs font-bold text-purple-600 mb-1">
                          <span>{progressMessage}</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-purple-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    )}

                    {state.chapterResult ? (
                       <div className="bg-green-50 rounded-lg p-4 border border-green-100 flex flex-col gap-3">
                          <div className="flex items-center text-green-700 font-semibold">
                            <CheckCircleIcon />
                            <span className="ml-2">Processing Complete</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => downloadFile(state.chapterResult!.csvContent, 'chapters', 'csv')}
                              className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition flex items-center justify-center"
                            >
                              <DownloadIcon /> Download CSV
                            </button>
                            <button
                              onClick={() => copyToClipboard(state.chapterResult!.csvContent)}
                              className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition flex items-center justify-center"
                              title="Copy CSV to Clipboard"
                            >
                              <ClipboardIcon />
                            </button>
                          </div>
                       </div>
                    ) : (
                      <button 
                        onClick={handleChapterClick}
                        disabled={state.status !== AppState.IDLE && state.status !== AppState.COMPLETED}
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2
                          ${state.status === AppState.PROCESSING_CHAPTERS 
                            ? 'bg-purple-400 cursor-not-allowed' 
                            : 'bg-purple-600 hover:bg-purple-700 hover:shadow-purple-300 active:scale-95'
                          }`}
                      >
                         {state.status === AppState.PROCESSING_CHAPTERS ? (
                            <><SpinnerIcon /> Processing...</>
                         ) : (
                            state.file ? 'Process Chapters' : 'Upload & Generate Chapters'
                         )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Captions Card */}
                <div className={`relative bg-white rounded-2xl border transition-all duration-300 flex flex-col overflow-hidden group
                  ${state.status === AppState.PROCESSING_CAPTIONS ? 'ring-2 ring-brand-500 border-transparent' : 'border-slate-200 hover:shadow-xl hover:-translate-y-1'}
                `}>
                  <div className="h-2 bg-gradient-to-r from-brand-500 to-cyan-400"></div>
                  <div className="p-8 flex-grow">
                    <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-6">
                      <UploadIcon />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Clean Captions</h3>
                    <p className="text-slate-500 leading-relaxed mb-6">
                      Professionally reformats VTT/SRT files. Removes filler words ("um", "uh"), fixes line breaks, and standardizes punctuation.
                    </p>

                    {/* Progress Bar for Captions */}
                    {state.status === AppState.PROCESSING_CAPTIONS && (
                      <div className="mb-6">
                        <div className="flex justify-between text-xs font-bold text-brand-600 mb-1">
                          <span>{progressMessage}</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-brand-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-brand-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    )}

                    {state.captionResult ? (
                       <div className="bg-green-50 rounded-lg p-4 border border-green-100 flex flex-col gap-3">
                          <div className="flex items-center text-green-700 font-semibold">
                            <CheckCircleIcon />
                            <span className="ml-2">Processing Complete</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => downloadFile(state.captionResult!.srtContent, 'cleaned_cc', 'srt')}
                              className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition flex items-center justify-center"
                            >
                              <DownloadIcon /> Download SRT
                            </button>
                             <button
                              onClick={() => copyToClipboard(state.captionResult!.srtContent)}
                              className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition flex items-center justify-center"
                              title="Copy SRT to Clipboard"
                            >
                              <ClipboardIcon />
                            </button>
                          </div>
                       </div>
                    ) : (
                      <button 
                        onClick={handleCaptionClick}
                        disabled={state.status !== AppState.IDLE && state.status !== AppState.COMPLETED}
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-brand-200 transition-all flex items-center justify-center gap-2
                          ${state.status === AppState.PROCESSING_CAPTIONS 
                            ? 'bg-brand-400 cursor-not-allowed' 
                            : 'bg-brand-600 hover:bg-brand-700 hover:shadow-brand-300 active:scale-95'
                          }`}
                      >
                         {state.status === AppState.PROCESSING_CAPTIONS ? (
                            <><SpinnerIcon /> Processing...</>
                         ) : (
                            state.file ? 'Process Captions' : 'Upload & Clean Captions'
                         )}
                      </button>
                    )}
                  </div>
                </div>
            </div>

            {/* Output Section (Preview) - Visible if ANY result exists */}
            {(state.chapterResult || state.captionResult) && (
              <div className="animate-fade-in-up mb-8">
                
                {/* 1. Preview Panel */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                   <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                      <h4 className="font-bold text-slate-700">
                        {state.chapterResult ? "Chapters Output Preview" : "Captions Output Preview"}
                      </h4>
                   </div>
                   
                   {/* CHAPTERS PREVIEW */}
                   {state.chapterResult && (
                     <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                        {/* Human Readable */}
                        <div className="p-6">
                          <h5 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex justify-between items-center">
                            <span>Human Readable (Part 1)</span>
                            <div className="flex gap-2">
                              <span className="text-brand-600 bg-brand-50 px-2 py-0.5 rounded text-[10px]">Formatted: HH:MM:SS</span>
                              <button onClick={() => copyToClipboard(state.chapterResult!.humanReadable)} className="text-slate-400 hover:text-brand-600 transition">
                                <ClipboardIcon />
                              </button>
                            </div>
                          </h5>
                          <div className="bg-white rounded border border-slate-200 p-4 font-mono text-sm text-slate-700 whitespace-pre-line overflow-auto max-h-96 custom-scrollbar shadow-inner">
                            {state.chapterResult.humanReadable}
                          </div>
                        </div>
                        {/* CSV Preview */}
                        <div className="p-6 bg-slate-50">
                          <h5 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex justify-between items-center">
                            <span>Bunny.net CSV (Part 2)</span>
                            <div className="flex gap-2">
                              <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-[10px]">Generated</span>
                              <button onClick={() => copyToClipboard(state.chapterResult!.csvContent)} className="text-slate-400 hover:text-green-600 transition">
                                <ClipboardIcon />
                              </button>
                            </div>
                          </h5>
                          <div className="bg-slate-900 rounded border border-slate-800 p-4 font-mono text-sm text-emerald-400 whitespace-pre-line overflow-auto max-h-96 custom-scrollbar shadow-inner">
                            {state.chapterResult.csvContent}
                          </div>
                        </div>
                     </div>
                   )}

                   {/* CAPTIONS PREVIEW */}
                   {(!state.chapterResult && state.captionResult) && (
                     <div className="p-6">
                        <h5 className="text-xs uppercase tracking-wide text-slate-500 font-bold mb-3 flex justify-between items-center">
                            <span>Cleaned SRT Content</span>
                            <div className="flex gap-2">
                              <span className="text-brand-600 bg-brand-50 px-2 py-0.5 rounded text-[10px]">Ready for Upload</span>
                              <button onClick={() => copyToClipboard(state.captionResult!.srtContent)} className="text-slate-400 hover:text-brand-600 transition">
                                <ClipboardIcon />
                              </button>
                            </div>
                        </h5>
                        <div className="bg-white rounded border border-slate-200 p-4 font-mono text-sm text-slate-700 whitespace-pre-line overflow-auto max-h-96 custom-scrollbar shadow-inner">
                            {state.captionResult.srtContent}
                        </div>
                     </div>
                   )}

                </div>
              </div>
            )}
          </div>
        </section>
        
        {/* DIVIDER */}
        <div className="relative mb-16">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t-2 border-slate-200 border-dashed"></div>
          </div>
        </div>

        {/* STEP 2: DEPLOYMENT */}
        <section className="animate-fade-in-up">
            <div className="flex items-center gap-4 mb-8">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-50 text-brand-600 font-bold text-lg flex items-center justify-center border-2 border-brand-100 shadow-sm">
              2
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Deploy to Bunny.net</h2>
              <p className="text-slate-500 text-sm mt-1">Update chapters directly to your video library.</p>
            </div>
          </div>

          {/* 2. Bunny.net Deployment Card */}
          <div className="pl-0 md:pl-14">
            <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Bunny.net Chapter Update Tool</h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded border border-slate-700">Production Ready (Secure Mode)</span>
              </div>
              
              <div className="p-6 space-y-6">
                  {/* Credentials Row */}
                  <div className="space-y-4">
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-xs text-slate-400">
                        <strong className="text-slate-300">Security Note:</strong> API Keys are securely managed on the server.
                        {envVarHint && (
                          <div className="mt-2 pt-2 border-t border-slate-700/50 text-amber-400">
                             <strong>Required Vercel Env Var:</strong> <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-200 select-all">{envVarHint}</code>
                          </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Library Selector */}
                      <div>
                        <label className="block text-slate-400 text-xs font-bold mb-2">Select Library</label>
                        <select 
                          value={selectedLibraryName}
                          onChange={handleLibraryChange}
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                        >
                          <option value="">-- Select your Funnel --</option>
                          {BUNNY_LIBRARIES.map(lib => (
                            <option key={lib.name} value={lib.name}>{lib.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <div className="flex justify-between">
                            <label className="block text-slate-400 text-xs font-bold mb-2">Video Library ID</label>
                            <span className={`text-[10px] uppercase font-bold tracking-wider mt-0.5 ${isIdHardcoded ? 'text-green-500' : 'text-amber-500'}`}>
                                {isIdHardcoded ? 'Auto-Set' : 'Manual Entry'}
                            </span>
                        </div>
                        <input 
                          type="text"
                          readOnly={isIdHardcoded}
                          value={bunnyConfig.libraryId}
                          onChange={(e) => handleBunnyConfigChange('libraryId', e.target.value)}
                          placeholder={selectedLibraryName ? "Enter Library ID" : ""}
                          className={`w-full bg-slate-900/50 border border-slate-800 text-slate-300 rounded px-3 py-2 text-sm focus:outline-none font-mono
                            ${isIdHardcoded ? 'text-slate-500 cursor-not-allowed' : 'focus:border-brand-500'}
                          `}
                        />
                      </div>
                    </div>
                    
                     <div className="grid grid-cols-1">
                        <div>
                        <label className="block text-slate-400 text-xs font-bold mb-2">Video GUID</label>
                        <input 
                          type="text"
                          placeholder="e.g. abc-123-def-456"
                          value={bunnyConfig.videoId}
                          onChange={(e) => handleBunnyConfigChange('videoId', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-500 transition-colors placeholder-slate-600"
                        />
                      </div>
                     </div>
                  </div>

                  {/* Editable CSV Area */}
                  <div>
                    <label className="block text-slate-400 text-xs font-bold mb-2">Chapter Data</label>
                    <textarea 
                      value={editableCsv}
                      onChange={(e) => setEditableCsv(e.target.value)}
                      placeholder={`Paste your chapter data here.\nYou can use Simple Format (one per line):\n0, 59, Introduction\n60, 299, Main Content`}
                      className="w-full h-40 bg-slate-800 border border-slate-700 text-slate-300 rounded px-4 py-3 text-sm font-mono focus:outline-none focus:border-brand-500 transition-colors custom-scrollbar placeholder-slate-600"
                    />
                    <p className="text-slate-500 text-xs mt-2">
                        You can paste Simple Format or the full JSON.
                    </p>
                  </div>

                  {/* Action Button & Status */}
                  <div>
                    <button 
                      onClick={handleBunnyUpdate}
                      disabled={bunnyStatus === BunnyStatus.UPLOADING}
                      className={`w-full py-3 rounded-lg font-bold text-white transition-all shadow-lg
                        ${bunnyStatus === BunnyStatus.UPLOADING 
                          ? 'bg-brand-700 cursor-not-allowed opacity-75' 
                          : 'bg-brand-600 hover:bg-brand-500 hover:shadow-brand-500/20 active:scale-95'}
                      `}
                    >
                      {bunnyStatus === BunnyStatus.UPLOADING ? (
                        <span className="flex items-center justify-center gap-2"><SpinnerIcon /> Updating Bunny.net...</span>
                      ) : (
                        "Add/Update Chapters"
                      )}
                    </button>

                    {/* Status Messages */}
                    {bunnyStatus === BunnyStatus.SUCCESS && (
                        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm flex items-center gap-2 animate-fade-in">
                          <CheckCircleIcon />
                          Chapters successfully updated on Bunny.net!
                        </div>
                    )}

                    {bunnyStatus === BunnyStatus.ERROR && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm animate-fade-in break-words">
                          <span className="font-bold block mb-1">Update Failed:</span>
                          {bunnyError}
                        </div>
                    )}
                  </div>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};

export default App;