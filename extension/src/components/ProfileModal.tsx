import React, { useState, useEffect } from 'react';
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

  // Sync formData when profile or isOpen updates
  useEffect(() => {
    setFormData(profile);
  }, [profile, isOpen]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="w-full max-w-md rounded-3xl bg-[#0F0402] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 bg-[#160603]">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-full bg-white/10 border border-white/10 text-orange-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Autofill Profile</h3>
              <p className="text-[11px] text-white/50">
                Used to match and fill forms with your explicit permission
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Alert */}
        <div className="m-3 p-2.5 rounded-xl bg-orange-950/20 border border-orange-500/30 flex items-start space-x-2">
          <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-orange-200 leading-relaxed">
            Data is saved only in your browser&apos;s private local storage. Never store passwords, PINs, or credit card numbers here.
          </div>
        </div>

        {/* Form Body */}
        <div className="px-4 py-2 space-y-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.fullName || ''}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+1 555-0199"
                className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Company
              </label>
              <input
                type="text"
                value={formData.company || ''}
                onChange={(e) => handleChange('company', e.target.value)}
                placeholder="Acme Corp"
                className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">
              Job Title
            </label>
            <input
              type="text"
              value={formData.jobTitle || ''}
              onChange={(e) => handleChange('jobTitle', e.target.value)}
              placeholder="Software Engineer"
              className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-white/70 mb-1">
              Address
            </label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="123 Tech Avenue"
              className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="San Francisco"
                className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Zip Code
              </label>
              <input
                type="text"
                value={formData.zipCode || ''}
                onChange={(e) => handleChange('zipCode', e.target.value)}
                placeholder="94107"
                className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/70 mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="United States"
                className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-[#160603]">
          <button
            onClick={handleClear}
            className="flex items-center space-x-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-xs text-white font-semibold transition-all shadow-md shadow-orange-600/30 cursor-pointer active:scale-95"
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
