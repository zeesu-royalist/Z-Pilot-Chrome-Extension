import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Trash2,
  User,
  Briefcase,
  GraduationCap,
  Link as LinkIcon,
  FileText,
  ShieldCheck,
  Zap,
  HelpCircle,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileUp,
  Download,
  RotateCcw,
  Upload,
  Camera,
} from 'lucide-react';
import { UserProfile, CustomFormQA, AutofillResult, UserResumeFile, UserPhotoFile } from '../types/index.js';
import { BrowserActionService } from '../services/browser-actions.js';
import { AutofillService } from '../services/autofill-service.js';

interface ProfileModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: UserProfile) => void;
  onAutofillPage?: () => void;
}

type TabKey = 'personal' | 'resume' | 'job' | 'education' | 'links' | 'pitch' | 'legal' | 'custom';

// Shared unified styling classes
const inputClass =
  'h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 focus:border-orange-500/60 focus:bg-black/60 text-xs text-white placeholder:text-white/25 outline-none transition-all w-full';
const selectClass =
  'h-9 px-3 rounded-xl bg-[#160603] hover:bg-[#1f0a05] border border-white/10 focus:border-orange-500/60 text-xs text-white outline-none transition-all w-full cursor-pointer';
const textareaClass =
  'px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 focus:border-orange-500/60 focus:bg-black/60 text-xs text-white placeholder:text-white/25 outline-none transition-all resize-none w-full';

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'resume', label: 'Resume & Photo', icon: FileUp },
  { key: 'job', label: 'Job & Career', icon: Briefcase },
  { key: 'education', label: 'Education', icon: GraduationCap },
  { key: 'links', label: 'Links & Social', icon: LinkIcon },
  { key: 'pitch', label: 'Skills & Pitch', icon: FileText },
  { key: 'legal', label: 'Work Auth', icon: ShieldCheck },
  { key: 'custom', label: 'Custom Q&A', icon: HelpCircle },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  profile,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [activeTab, setActiveTab] = useState<TabKey>('personal');
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sync formData when profile or isOpen updates
  useEffect(() => {
    setFormData(profile);
    setAutofillResult(null);
  }, [profile, isOpen]);

  // Handle ESC key to close full-window view
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (field: keyof UserProfile, val: any) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = () => {
    onSave(formData);
    setSaveSuccessMsg('Profile saved successfully!');
    setTimeout(() => {
      setSaveSuccessMsg(null);
      onClose();
    }, 700);
  };

  const handleClear = () => {
    if (confirm('Clear all locally saved profile information?')) {
      const cleared: UserProfile = {
        fullName: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        website: '',
        portfolioUrl: '',
        linkedinUrl: '',
        githubUrl: '',
        twitterUrl: '',
        otherUrl: '',
        company: '',
        jobTitle: '',
        totalExperience: '',
        noticePeriod: '',
        currentSalary: '',
        expectedSalary: '',
        preferredWorkMode: '',
        startDate: '',
        degree: '',
        fieldOfStudy: '',
        university: '',
        graduationYear: '',
        gpa: '',
        skills: '',
        summary: '',
        coverLetter: '',
        workAuthorization: '',
        visaSponsorship: '',
        willingToRelocate: '',
        gender: '',
        veteranStatus: '',
        disabilityStatus: '',
        customQuestions: [],
        resume: undefined,
      };
      setFormData(cleared);
      onSave(cleared);
      setAutofillResult(null);
    }
  };

  // 1-Click Autofill Trigger (Safe Mode: fills blank fields without overwriting user entries)
  const handleTriggerAutofill = async () => {
    setIsAutofilling(true);
    setAutofillResult(null);

    // Save profile first so latest edits are applied
    onSave(formData);

    try {
      const res = await BrowserActionService.autofillPageForm(formData, {
        overwriteExisting: false,
      });
      setAutofillResult(res);
    } catch (err: unknown) {
      setAutofillResult({
        success: false,
        filledCount: 0,
        totalScanned: 0,
        filledDetails: [],
        failedFields: [{ name: 'error', reason: (err as Error).message || 'Autofill error' }],
      });
    } finally {
      setIsAutofilling(false);
    }
  };

  // Dedicated Resume-Only upload trigger
  const handleUploadResumeToActiveForm = async () => {
    if (!formData.resume?.base64Data) {
      alert('Please upload a resume file first.');
      return;
    }
    setIsAutofilling(true);
    setAutofillResult(null);

    // Save profile first so latest resume edits are applied
    onSave(formData);

    try {
      const res = await BrowserActionService.autofillPageForm(formData, {
        overwriteExisting: false,
        resumeOnly: true,
      });
      setAutofillResult(res);
    } catch (err: unknown) {
      setAutofillResult({
        success: false,
        filledCount: 0,
        totalScanned: 0,
        filledDetails: [],
        failedFields: [{ name: 'resume', reason: (err as Error).message || 'Resume upload error' }],
      });
    } finally {
      setIsAutofilling(false);
    }
  };

  // Resume file handling
  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleResumeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Resume file size must be under 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const resumeFile: UserResumeFile = {
        fileName: file.name,
        fileType: file.type || 'application/pdf',
        fileSize: file.size,
        base64Data,
        uploadedAt: Date.now(),
      };
      handleChange('resume', resumeFile);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDownloadResume = () => {
    if (!formData.resume?.base64Data) return;
    const a = document.createElement('a');
    a.href = formData.resume.base64Data;
    a.download = formData.resume.fileName || 'Resume.pdf';
    a.click();
  };

  const handleRemoveResume = () => {
    handleChange('resume', undefined);
  };

  // Passport photo handling
  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Photo file size must be under 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      const photoFile: UserPhotoFile = {
        fileName: file.name,
        fileType: file.type || 'image/jpeg',
        fileSize: file.size,
        base64Data,
        uploadedAt: Date.now(),
      };
      handleChange('photo', photoFile);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    handleChange('photo', undefined);
  };

  const handleUploadPhotoToActiveForm = async () => {
    if (!formData.photo?.base64Data) {
      alert('Please upload a passport photo first.');
      return;
    }
    setIsAutofilling(true);
    setAutofillResult(null);

    onSave(formData);

    try {
      const res = await BrowserActionService.autofillPageForm(formData, {
        overwriteExisting: false,
        photoOnly: true,
      });
      setAutofillResult(res);
    } catch (err: unknown) {
      setAutofillResult({
        success: false,
        filledCount: 0,
        totalScanned: 0,
        filledDetails: [],
        failedFields: [{ name: 'photo', reason: (err as Error).message || 'Photo upload error' }],
      });
    } finally {
      setIsAutofilling(false);
    }
  };

  // Custom Q&A handlers
  const handleAddCustomQuestion = () => {
    const list = formData.customQuestions || [];
    const newQA: CustomFormQA = {
      id: `qa_${Date.now()}`,
      question: '',
      answer: '',
    };
    handleChange('customQuestions', [...list, newQA]);
  };

  const handleUpdateCustomQuestion = (
    id: string,
    field: 'question' | 'answer',
    val: string
  ) => {
    const list = formData.customQuestions || [];
    const updated = list.map((item) => (item.id === id ? { ...item, [field]: val } : item));
    handleChange('customQuestions', updated);
  };

  const handleRemoveCustomQuestion = (id: string) => {
    const list = formData.customQuestions || [];
    handleChange(
      'customQuestions',
      list.filter((item) => item.id !== id)
    );
  };

  const filledCount = AutofillService.getFilledCount(formData);

  // Tab count indicators
  const tabCounts: Record<TabKey, number> = {
    personal: [
      formData.fullName,
      formData.firstName,
      formData.lastName,
      formData.email,
      formData.phone,
      formData.address,
      formData.city,
      formData.state,
      formData.zipCode,
      formData.country,
    ].filter(Boolean).length,
    resume:
      (formData.resume && formData.resume.base64Data ? 1 : 0) +
      (formData.photo && formData.photo.base64Data ? 1 : 0),
    job: [
      formData.jobTitle,
      formData.company,
      formData.totalExperience,
      formData.noticePeriod,
      formData.currentSalary,
      formData.expectedSalary,
      formData.preferredWorkMode,
      formData.startDate,
    ].filter(Boolean).length,
    education: [
      formData.degree,
      formData.fieldOfStudy,
      formData.university,
      formData.graduationYear,
      formData.gpa,
    ].filter(Boolean).length,
    links: [
      formData.linkedinUrl,
      formData.githubUrl,
      formData.portfolioUrl || formData.website,
      formData.twitterUrl,
      formData.otherUrl,
    ].filter(Boolean).length,
    pitch: [formData.skills, formData.summary, formData.coverLetter].filter(Boolean).length,
    legal: [
      formData.workAuthorization,
      formData.visaSponsorship,
      formData.willingToRelocate,
      formData.gender,
      formData.veteranStatus,
      formData.disabilityStatus,
    ].filter(Boolean).length,
    custom: (formData.customQuestions || []).filter((q) => q.question && q.answer).length,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A0302] overflow-hidden font-sans select-none text-white animate-fade-in">
      {/* ── Top Header (Full Window) ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-orange-500/20 bg-gradient-to-r from-black/90 via-[#180a04]/90 to-black/90 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white tracking-tight">
                Job & Form Autofill
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30 whitespace-nowrap shrink-0">
                {filledCount} fields set
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              All fields optional • 1-Click to auto-fill in any forms
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close (Esc)"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all cursor-pointer active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── 1-Click Autofill Action Bar (Unified & Balanced) ── */}
      <div className="mx-4 sm:mx-6 mt-2.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-orange-950/40 via-amber-950/20 to-black/60 border border-orange-500/25 flex items-center justify-between gap-3 shadow-md shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 fill-orange-400/30" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white flex items-center space-x-1.5">
              <span>1-Click Auto-Fill</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30 leading-none">
                ATS Ready
              </span>
            </div>
            <div className="text-[11px] text-white/50 truncate">
              Fills job portals, Greenhouse, Lever, Workday & web forms
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTriggerAutofill}
          disabled={isAutofilling}
          className="h-8 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 border border-orange-400/30 text-xs font-semibold text-white shadow-md shadow-orange-600/25 flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-50 transition-all shrink-0 whitespace-nowrap"
        >
          {isAutofilling ? (
            <>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Filling...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>Fill Now</span>
            </>
          )}
        </button>
      </div>

      {/* ── Live Autofill Result Toast/Banner ── */}
      {autofillResult && (
        <div
          className={`mx-4 sm:mx-6 mt-2.5 p-2.5 rounded-xl border flex items-start space-x-2 text-xs transition-all shrink-0 ${
            autofillResult.success
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
              : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
          }`}
        >
          {autofillResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-medium">
              {autofillResult.success
                ? autofillResult.filledDetails.some((d) => d.fieldName.includes('Resume') || d.fieldName.includes('Photo'))
                  ? autofillResult.filledCount > 1
                    ? `✓ Attached files & filled ${autofillResult.filledCount - autofillResult.filledDetails.filter((d) => d.fieldName.includes('File') || d.fieldName.includes('Photo')).length} field(s) on this page!`
                    : `✓ Successfully attached: ${autofillResult.filledDetails[0]?.valueSnippet || 'file'}!`
                  : `✓ Successfully filled ${autofillResult.filledCount} field(s) on this page!`
                : autofillResult.failedFields?.[0]?.reason ||
                  (autofillResult.totalScanned > 0
                    ? `Scanned ${autofillResult.totalScanned} inputs, but no matching profile values were configured.`
                    : 'No fillable input fields or file upload detected on this page.')}
            </div>
            {autofillResult.filledDetails && autofillResult.filledDetails.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {autofillResult.filledDetails.map((det, idx) => (
                  <span
                    key={idx}
                    className="inline-block px-1.5 py-0.5 rounded bg-emerald-900/40 text-[10px] text-emerald-300 font-mono"
                  >
                    ✓ {det.fieldName} ({det.valueSnippet})
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setAutofillResult(null)}
            className="text-white/40 hover:text-white text-xs cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Navigation Tabs (Segmented Pill Bar) ── */}
      <div className="px-4 sm:px-6 pt-3 pb-1 border-b border-white/10 bg-[#120502]/60 shrink-0">
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = tabCounts[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`h-8 px-3 rounded-xl text-xs font-medium flex items-center space-x-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm font-semibold'
                    : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-400' : 'text-white/50'}`} />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono leading-none ${
                      isActive ? 'bg-orange-500/30 text-orange-200' : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable Tab Body Contents (Full Window) ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* TAB 1: PERSONAL & CONTACT */}
        {activeTab === 'personal' && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Full Name <span className="text-white/35 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.fullName || ''}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  First Name <span className="text-white/35 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName || ''}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  placeholder="e.g. Jane"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Last Name <span className="text-white/35 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.lastName || ''}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  placeholder="e.g. Doe"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Email Address <span className="text-white/35 font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="e.g. jane@example.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Phone / Mobile <span className="text-white/35 font-normal">(With country code)</span>
                </label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="e.g. +1 555-0199 or +91 9876543210"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Street Address <span className="text-white/35 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="e.g. 123 Tech Avenue, Apt 4B"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="e.g. San Francisco"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">State / Province</label>
                <input
                  type="text"
                  value={formData.state || ''}
                  onChange={(e) => handleChange('state', e.target.value)}
                  placeholder="e.g. CA or Delhi"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">Zip / Postal Code</label>
                <input
                  type="text"
                  value={formData.zipCode || ''}
                  onChange={(e) => handleChange('zipCode', e.target.value)}
                  placeholder="e.g. 94107 or 110001"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">Country</label>
                <input
                  type="text"
                  value={formData.country || ''}
                  onChange={(e) => handleChange('country', e.target.value)}
                  placeholder="e.g. United States or India"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RESUME & CV DOCUMENT */}
        {activeTab === 'resume' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">Resume & CV Document</div>
                <div className="text-[11px] text-white/50 truncate">
                  Store your PDF or Word resume locally • 1-Click auto-attach
                </div>
              </div>
              {formData.resume?.base64Data && (
                <span className="text-[10px] px-2.5 py-1 rounded-full font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap shrink-0 inline-flex items-center space-x-1 select-none">
                  <span className="leading-none">✓</span>
                  <span className="leading-none whitespace-nowrap">Resume Stored</span>
                </span>
              )}
            </div>

            {!formData.resume?.base64Data ? (
              /* Empty State: Drag & Drop or Click to Upload */
              <label className="border-2 border-dashed border-white/15 hover:border-orange-500/50 rounded-2xl p-6 text-center transition-all bg-white/[0.02] hover:bg-orange-950/10 cursor-pointer flex flex-col items-center justify-center space-y-2.5 group">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleResumeFileUpload}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/25 text-orange-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileUp className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white mb-0.5">
                    Click to Upload Resume / CV
                  </div>
                  <div className="text-[11px] text-white/40">
                    Supports PDF, DOC, DOCX (Max 5 MB) • Stored 100% locally
                  </div>
                </div>
                <div className="h-8 px-4 rounded-xl bg-orange-500/20 group-hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-medium flex items-center space-x-1.5 transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select Resume File</span>
                </div>
              </label>
            ) : (
              /* Loaded State: Clean Card with Quick Actions */
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-orange-500/30 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate flex items-center space-x-2">
                        <span className="truncate">{formData.resume.fileName}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                          READY
                        </span>
                      </div>
                      <div className="text-[11px] text-white/50">
                        {formatFileSize(formData.resume.fileSize)} • Uploaded{' '}
                        {new Date(formData.resume.uploadedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={handleDownloadResume}
                      title="Download / View Resume"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleRemoveResume}
                      title="Remove Resume"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/15 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Direct 1-Click Upload to Active Form */}
                <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2.5">
                  <button
                    onClick={handleUploadResumeToActiveForm}
                    disabled={isAutofilling}
                    className="h-8.5 px-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 border border-orange-400/30 text-xs font-semibold text-white shadow-md shadow-orange-600/25 flex items-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-50 transition-all shrink-0"
                  >
                    {isAutofilling ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Attaching Resume...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-white" />
                        <span>Upload to Current Form Now</span>
                      </>
                    )}
                  </button>

                  <label className="h-8.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs text-white/80 hover:text-white flex items-center space-x-1.5 cursor-pointer transition-all shrink-0">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleResumeFileUpload}
                      className="hidden"
                    />
                    <RotateCcw className="w-3 h-3" />
                    <span>Replace</span>
                  </label>
                </div>
              </div>
            )}

            {/* ── PASSPORT SIZE PHOTO SECTION ── */}
            <div className="pt-2 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2.5 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Passport Size Photo / Profile Picture</div>
                  <div className="text-[11px] text-white/50 truncate">
                    JPG, PNG or WebP • Auto-attaches to job application photo inputs
                  </div>
                </div>
                {formData.photo?.base64Data && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap shrink-0 inline-flex items-center space-x-1 select-none">
                    <span className="leading-none">✓</span>
                    <span className="leading-none whitespace-nowrap">Photo Stored</span>
                  </span>
                )}
              </div>

              {!formData.photo?.base64Data ? (
                /* Empty State: Upload Photo */
                <label className="border-2 border-dashed border-white/15 hover:border-orange-500/50 rounded-2xl p-5 text-center transition-all bg-white/[0.02] hover:bg-orange-950/10 cursor-pointer flex flex-col items-center justify-center space-y-2 group">
                  <input
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.webp"
                    onChange={handlePhotoFileUpload}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/25 text-orange-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white mb-0.5">
                      Click to Upload Passport Photo
                    </div>
                    <div className="text-[11px] text-white/40">
                      Supports JPG, JPEG, PNG, WebP (Max 3 MB) • Stored 100% locally
                    </div>
                  </div>
                  <div className="h-7.5 px-3 rounded-xl bg-orange-500/20 group-hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-medium flex items-center space-x-1.5 transition-all">
                    <Upload className="w-3 h-3" />
                    <span>Select Photo</span>
                  </div>
                </label>
              ) : (
                /* Loaded State: Clean Card with Thumbnail Preview */
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-orange-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-12 h-14 rounded-xl overflow-hidden border border-orange-500/30 bg-black/40 shrink-0 shadow-sm flex items-center justify-center">
                        <img
                          src={formData.photo.base64Data}
                          alt="Passport Photo Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate flex items-center space-x-2">
                          <span className="truncate">{formData.photo.fileName}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                            READY
                          </span>
                        </div>
                        <div className="text-[11px] text-white/50">
                          {formatFileSize(formData.photo.fileSize)} • Uploaded{' '}
                          {new Date(formData.photo.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={handleRemovePhoto}
                        title="Remove Photo"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/15 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Direct 1-Click Upload Photo to Active Form */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2.5">
                    <button
                      onClick={handleUploadPhotoToActiveForm}
                      disabled={isAutofilling}
                      className="h-8.5 px-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 border border-orange-400/30 text-xs font-semibold text-white shadow-md shadow-orange-600/25 flex items-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-50 transition-all shrink-0"
                    >
                      {isAutofilling ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Attaching Photo...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-white" />
                          <span>Upload Photo to Form Now</span>
                        </>
                      )}
                    </button>

                    <label className="h-8.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs text-white/80 hover:text-white flex items-center space-x-1.5 cursor-pointer transition-all shrink-0">
                      <input
                        type="file"
                        accept="image/*,.jpg,.jpeg,.png,.webp"
                        onChange={handlePhotoFileUpload}
                        className="hidden"
                      />
                      <RotateCcw className="w-3 h-3" />
                      <span>Replace</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Informational tip */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-white/50 space-y-1">
              <div className="text-white/70 font-medium">💡 How Document Auto-Upload Works:</div>
              <p>
                Jab aap kisi job site (Greenhouse, Lever, Workday, Government portals, etc.) par <strong>&quot;Fill Now&quot;</strong> ya direct upload button click karenge, Z-Pilot page ke Resume aur Passport Photo inputs ko alag-alag detect karke automatically attach kar dega.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: JOB & EXPERIENCE */}
        {activeTab === 'job' && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Current / Target Job Title
                </label>
                <input
                  type="text"
                  value={formData.jobTitle || ''}
                  onChange={(e) => handleChange('jobTitle', e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Current Employer / Company
                </label>
                <input
                  type="text"
                  value={formData.company || ''}
                  onChange={(e) => handleChange('company', e.target.value)}
                  placeholder="e.g. Acme Tech Corp"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Total Experience (Years)
                </label>
                <input
                  type="text"
                  value={formData.totalExperience || ''}
                  onChange={(e) => handleChange('totalExperience', e.target.value)}
                  placeholder="e.g. 4.5 years or 4"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Notice Period / Availability
                </label>
                <input
                  type="text"
                  value={formData.noticePeriod || ''}
                  onChange={(e) => handleChange('noticePeriod', e.target.value)}
                  placeholder="e.g. Immediate, 15 Days, 30 Days"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Earliest Start Date
                </label>
                <input
                  type="text"
                  value={formData.startDate || ''}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  placeholder="e.g. Immediate or 2026-12-01"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Current CTC / Salary
                </label>
                <input
                  type="text"
                  value={formData.currentSalary || ''}
                  onChange={(e) => handleChange('currentSalary', e.target.value)}
                  placeholder="e.g. $95,000 or ₹14 LPA"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Expected CTC / Salary
                </label>
                <input
                  type="text"
                  value={formData.expectedSalary || ''}
                  onChange={(e) => handleChange('expectedSalary', e.target.value)}
                  placeholder="e.g. $125,000 or ₹18 LPA"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Preferred Work Mode
                </label>
                <select
                  value={formData.preferredWorkMode || ''}
                  onChange={(e) => handleChange('preferredWorkMode', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select (Optional)</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site / In-Office</option>
                  <option value="Flexible">Flexible / Any</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EDUCATION */}
        {activeTab === 'education' && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Highest Degree / Qualification
                </label>
                <input
                  type="text"
                  value={formData.degree || ''}
                  onChange={(e) => handleChange('degree', e.target.value)}
                  placeholder="e.g. Bachelor of Technology (B.Tech)"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Field of Study / Major
                </label>
                <input
                  type="text"
                  value={formData.fieldOfStudy || ''}
                  onChange={(e) => handleChange('fieldOfStudy', e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                University / College / School
              </label>
              <input
                type="text"
                value={formData.university || ''}
                onChange={(e) => handleChange('university', e.target.value)}
                placeholder="e.g. Delhi Technological University or UC Berkeley"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Graduation Year / Passing Year
                </label>
                <input
                  type="text"
                  value={formData.graduationYear || ''}
                  onChange={(e) => handleChange('graduationYear', e.target.value)}
                  placeholder="e.g. 2023"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  CGPA / GPA / Percentage
                </label>
                <input
                  type="text"
                  value={formData.gpa || ''}
                  onChange={(e) => handleChange('gpa', e.target.value)}
                  placeholder="e.g. 8.8 / 10 or 3.9 / 4.0 or 85%"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: LINKS & SOCIALS */}
        {activeTab === 'links' && (
          <div className="space-y-3.5 animate-fade-in">
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                LinkedIn Profile URL
              </label>
              <input
                type="url"
                value={formData.linkedinUrl || ''}
                onChange={(e) => handleChange('linkedinUrl', e.target.value)}
                placeholder="https://linkedin.com/in/username"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                GitHub Profile URL
              </label>
              <input
                type="url"
                value={formData.githubUrl || ''}
                onChange={(e) => handleChange('githubUrl', e.target.value)}
                placeholder="https://github.com/username"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Portfolio / Personal Website URL
              </label>
              <input
                type="url"
                value={formData.portfolioUrl || formData.website || ''}
                onChange={(e) => {
                  handleChange('portfolioUrl', e.target.value);
                  handleChange('website', e.target.value);
                }}
                placeholder="https://yourportfolio.dev"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Twitter / X Profile URL
                </label>
                <input
                  type="url"
                  value={formData.twitterUrl || ''}
                  onChange={(e) => handleChange('twitterUrl', e.target.value)}
                  placeholder="https://x.com/username"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Other Link (Behance / Dribbble / Medium)
                </label>
                <input
                  type="url"
                  value={formData.otherUrl || ''}
                  onChange={(e) => handleChange('otherUrl', e.target.value)}
                  placeholder="https://behance.net/username"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SKILLS & PITCH */}
        {activeTab === 'pitch' && (
          <div className="space-y-3.5 animate-fade-in">
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Key Skills & Technologies <span className="text-white/40 font-normal">(Comma separated)</span>
              </label>
              <input
                type="text"
                value={formData.skills || ''}
                onChange={(e) => handleChange('skills', e.target.value)}
                placeholder="e.g. React, TypeScript, Node.js, Next.js, Tailwind CSS, Python, AWS, Docker"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Professional Summary / Bio <span className="text-white/40 font-normal">(Short intro)</span>
              </label>
              <textarea
                rows={2}
                value={formData.summary || ''}
                onChange={(e) => handleChange('summary', e.target.value)}
                placeholder="e.g. Full-stack software engineer with 4+ years of experience building high-throughput web applications and AI agent tools."
                className={textareaClass}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Default Cover Letter / Pitch <span className="text-white/40 font-normal">(&quot;Why should we hire you?&quot;)</span>
              </label>
              <textarea
                rows={4}
                value={formData.coverLetter || ''}
                onChange={(e) => handleChange('coverLetter', e.target.value)}
                placeholder="e.g. Dear Hiring Team, I am excited to apply for this role. With my background in TypeScript and modern frontend architectures, I specialize in crafting performant user experiences..."
                className={textareaClass}
              />
            </div>
          </div>
        )}

        {/* TAB 7: WORK AUTHORIZATION & EEO */}
        {activeTab === 'legal' && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Authorized to Work in Country?
                </label>
                <select
                  value={formData.workAuthorization || ''}
                  onChange={(e) => handleChange('workAuthorization', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select (Optional)</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Will Require Visa Sponsorship?
                </label>
                <select
                  value={formData.visaSponsorship || ''}
                  onChange={(e) => handleChange('visaSponsorship', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select (Optional)</option>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/70 mb-1">
                  Willing to Relocate?
                </label>
                <select
                  value={formData.willingToRelocate || ''}
                  onChange={(e) => handleChange('willingToRelocate', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select (Optional)</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Remote Only">Remote Only</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="text-[11px] font-medium text-white/60 mb-2">
                Equal Opportunity & Demographics (Standard ATS questions — Completely optional):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Gender</label>
                  <input
                    type="text"
                    value={formData.gender || ''}
                    onChange={(e) => handleChange('gender', e.target.value)}
                    placeholder="e.g. Male / Female / Prefer not to say"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Veteran Status</label>
                  <input
                    type="text"
                    value={formData.veteranStatus || ''}
                    onChange={(e) => handleChange('veteranStatus', e.target.value)}
                    placeholder="e.g. Not a veteran / Decline"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/50 mb-1">Disability Status</label>
                  <input
                    type="text"
                    value={formData.disabilityStatus || ''}
                    onChange={(e) => handleChange('disabilityStatus', e.target.value)}
                    placeholder="e.g. No disability / Decline"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: CUSTOM Q&A / JD SPECIFIC */}
        {activeTab === 'custom' && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Custom Questions & Answers</div>
                <div className="text-[11px] text-white/50">
                  Add custom questions that frequently appear on specific job portals or job descriptions.
                </div>
              </div>
              <button
                onClick={handleAddCustomQuestion}
                className="h-8 px-3 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-medium transition-colors flex items-center space-x-1.5 cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>

            {(!formData.customQuestions || formData.customQuestions.length === 0) && (
              <div className="p-6 text-center rounded-2xl bg-black/30 border border-white/5 text-xs text-white/40 space-y-1">
                <p>No custom Q&A pairs added yet.</p>
                <p className="text-[11px] text-white/30">
                  Click &quot;Add Question&quot; to auto-fill custom questions like &quot;GitHub Username&quot; or &quot;Why work here?&quot;.
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              {(formData.customQuestions || []).map((qa, index) => (
                <div
                  key={qa.id}
                  className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2 relative group hover:border-orange-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-orange-400">
                      Question #{index + 1}
                    </span>
                    <button
                      onClick={() => handleRemoveCustomQuestion(qa.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/15 transition-all cursor-pointer"
                      title="Remove question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={qa.question}
                    onChange={(e) => handleUpdateCustomQuestion(qa.id, 'question', e.target.value)}
                    placeholder="e.g. What is your primary programming language? or GitHub Username"
                    className={inputClass}
                  />

                  <textarea
                    rows={2}
                    value={qa.answer}
                    onChange={(e) => handleUpdateCustomQuestion(qa.id, 'answer', e.target.value)}
                    placeholder="Enter your exact answer to be auto-filled..."
                    className={textareaClass}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Security Alert & Local Storage Notice ── */}
      <div className="mx-4 sm:mx-6 mb-2 p-2 rounded-xl bg-orange-950/20 border border-orange-500/20 flex items-center justify-between text-[11px] text-orange-200/80 shrink-0">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span>Stored 100% privately in your local browser storage. Never sent to any server.</span>
        </div>
        {saveSuccessMsg && (
          <span className="text-emerald-300 font-semibold text-[11px] animate-pulse">
            {saveSuccessMsg}
          </span>
        )}
      </div>

      {/* ── Modal Footer (Full width, unified heights, clean & simple) ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-white/10 bg-[#140502] shrink-0">
        <button
          onClick={handleClear}
          className="h-9 px-3 rounded-xl text-xs font-medium text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-medium text-white/80 hover:text-white transition-all cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-xs font-semibold text-white shadow-md shadow-orange-500/25 flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};
