import React, { useState } from 'react';
import { X, Save, Trash2, User, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types/index.js';

interface ProfileModalProps {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: UserProfile) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  profile,
  isOpen,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<UserProfile>(profile);

  if (!isOpen) return null;

  const handleChange = (field: keyof UserProfile, val: string) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  const handleClear = () => {
    if (confirm('Clear all locally saved profile information?')) {
      const cleared: UserProfile = {
        fullName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        zipCode: '',
        country: '',
        company: '',
        jobTitle: '',
        website: '',
      };
      setFormData(cleared);
      onSave(cleared);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-pilot-panel border border-pilot-border shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pilot-border">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-pilot-primary/10 text-pilot-primary">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Autofill Profile</h3>
              <p className="text-[11px] text-pilot-text-muted">
                Used to match and fill forms with your permission
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-pilot-text-muted hover:text-white hover:bg-pilot-card transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Alert */}
        <div className="m-3 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 flex items-start space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-emerald-200 leading-relaxed">
            Data is saved only in your browser's private local storage. Never store passwords, PINs, or credit card numbers here.
          </div>
        </div>

        {/* Form Body */}
        <div className="px-4 py-2 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.fullName || ''}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-2.5 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-2.5 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                Phone
              </label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+1 555-0199"
                className="w-full px-2.5 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                Company
              </label>
              <input
                type="text"
                value={formData.company || ''}
                onChange={(e) => handleChange('company', e.target.value)}
                placeholder="Acme Corp"
                className="w-full px-2.5 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
              Job Title
            </label>
            <input
              type="text"
              value={formData.jobTitle || ''}
              onChange={(e) => handleChange('jobTitle', e.target.value)}
              placeholder="Software Engineer"
              className="w-full px-2.5 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
              Address
            </label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="123 Tech Avenue"
              className="w-full px-2.5 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="San Francisco"
                className="w-full px-2 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                Zip Code
              </label>
              <input
                type="text"
                value={formData.zipCode || ''}
                onChange={(e) => handleChange('zipCode', e.target.value)}
                placeholder="94107"
                className="w-full px-2 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-pilot-text-secondary mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="United States"
                className="w-full px-2 py-1.5 rounded-lg bg-pilot-card border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-pilot-border bg-pilot-card/50">
          <button
            onClick={handleClear}
            className="flex items-center space-x-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-pilot-card hover:bg-pilot-cardHover border border-pilot-border text-xs text-pilot-text-secondary hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-pilot-primary hover:bg-pilot-primaryHover text-xs text-white font-medium transition-colors shadow-sm shadow-pilot-primary/30"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
