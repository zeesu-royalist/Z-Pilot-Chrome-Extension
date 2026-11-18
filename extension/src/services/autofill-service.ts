import { UserProfile } from '../types/index.js';

export interface FormFieldDescriptor {
  id?: string;
  name?: string;
  type?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  role?: string;
  options?: Array<{ value: string; text: string }>;
}

export interface MatchedFieldValue {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

export class AutofillService {
  /**
   * Sanitizes value for input type (e.g. extracts pure digits for type="number")
   */
  public static sanitizeValueForField(value: string, fieldType?: string): string {
    if (!value) return '';
    const type = (fieldType || '').toLowerCase();
    if (type === 'number') {
      const match = value.replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/);
      return match ? match[0] : '';
    }
    return value;
  }

  /**
   * Matches an input field against a user profile using intelligent semantic regexes
   * and priority attribute cues (autocomplete, label, name, id, placeholder).
   */
  public static matchField(
    field: FormFieldDescriptor,
    profile: UserProfile
  ): MatchedFieldValue | null {
    if (!profile) return null;

    const rawLabel = (field.label || '').trim();
    const rawName = (field.name || '').trim();
    const rawId = (field.id || '').trim();
    const rawPlaceholder = (field.placeholder || '').trim();
    const rawAria = (field.ariaLabel || '').trim();
    const autocomplete = (field.autocomplete || '').toLowerCase().trim();
    const fieldType = (field.type || 'text').toLowerCase().trim();
    const fieldRole = (field.role || '').toLowerCase().trim();

    // Skip password inputs for security
    if (fieldType === 'password') return null;

    // Exclude search inputs, filter boxes, and search queries from form filling
    if (
      fieldType === 'search' ||
      fieldRole === 'searchbox' ||
      /\b(search|searchbox|find\s*jobs|search_query)\b/i.test(rawName) ||
      /\b(search\s*by|search\s*jobs|search\s*here|find\s*a\s*job)\b/i.test(rawPlaceholder)
    ) {
      return null;
    }

    const combinedText = `${rawLabel} ${rawName} ${rawId} ${rawPlaceholder} ${rawAria}`.toLowerCase();

    // 0. File Upload Inputs (Strictly isolated between Resume and Passport Photo)
    if (fieldType === 'file') {
      // 0a. Check Passport Photo / Profile Picture
      const isPhotoExplicit = /\b(photo|avatar|picture|headshot|passport|photograph|applicant[_-]?pic|profile[_-]?pic|candidate[_-]?photo)\b/i.test(
        combinedText
      );

      if (isPhotoExplicit) {
        if (!profile.photo || !profile.photo.base64Data) return null;
        return {
          key: 'photo',
          label: 'Passport Size Photo',
          value: profile.photo.fileName || 'Passport_Photo.jpg',
          confidence: 0.99,
        };
      }

      // 0b. Check Resume / CV
      if (!profile.resume || !profile.resume.base64Data) return null;

      // Explicitly reject non-resume file inputs (cover letter, photo, portfolio, transcripts, etc.)
      if (
        /\b(cover[_-]?letter|coverletter|photo|avatar|picture|headshot|passport|photograph|image|portfolio|transcript|certificate|sample|work[_-]?sample|attachment|other)\b/i.test(
          combinedText
        )
      ) {
        return null;
      }

      // ONLY match if it explicitly mentions resume or CV
      const isResumeExplicit = /\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(
        combinedText
      );

      if (isResumeExplicit) {
        return {
          key: 'resume',
          label: 'Resume / CV File',
          value: profile.resume.fileName || 'Resume.pdf',
          confidence: 0.99,
        };
      }
      return null;
    }

    // 1. Check Custom Q&A Pairs first (allows users to override any specific question)
    if (Array.isArray(profile.customQuestions) && profile.customQuestions.length > 0) {
      for (const qa of profile.customQuestions) {
        if (!qa.question || !qa.answer) continue;
        const qClean = qa.question.toLowerCase().trim();
        // Check if question phrase appears in label/name/placeholder or vice versa
        if (
          combinedText.includes(qClean) ||
          (rawLabel && qClean.includes(rawLabel.toLowerCase())) ||
          (rawName && qClean.includes(rawName.toLowerCase()))
        ) {
          return {
            key: `custom_${qa.id}`,
            label: qa.question,
            value: qa.answer,
            confidence: 0.95,
          };
        }
      }
    }

    // 2. Check Autocomplete Attributes (Standard HTML5 Autofill Cues)
    if (autocomplete) {
      if (autocomplete === 'given-name' || autocomplete === 'first-name') {
        const val = profile.firstName || (profile.fullName ? profile.fullName.trim().split(/\s+/)[0] : '');
        if (val) return { key: 'firstName', label: 'First Name', value: val, confidence: 1 };
      }
      if (autocomplete === 'family-name' || autocomplete === 'last-name') {
        const val = profile.lastName || (profile.fullName ? profile.fullName.trim().split(/\s+/).slice(1).join(' ') : '');
        if (val) return { key: 'lastName', label: 'Last Name', value: val, confidence: 1 };
      }
      if (autocomplete === 'name') {
        const val = profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
        if (val) return { key: 'fullName', label: 'Full Name', value: val, confidence: 1 };
      }
      if (autocomplete === 'email') {
        if (profile.email) return { key: 'email', label: 'Email', value: profile.email, confidence: 1 };
      }
      if (autocomplete === 'tel' || autocomplete === 'tel-national') {
        if (profile.phone) return { key: 'phone', label: 'Phone', value: profile.phone, confidence: 1 };
      }
      if (autocomplete === 'street-address' || autocomplete === 'address-line1') {
        if (profile.address) return { key: 'address', label: 'Street Address', value: profile.address, confidence: 1 };
      }
      if (autocomplete === 'address-level2') {
        if (profile.city) return { key: 'city', label: 'City', value: profile.city, confidence: 1 };
      }
      if (autocomplete === 'address-level1') {
        if (profile.state) return { key: 'state', label: 'State', value: profile.state, confidence: 1 };
      }
      if (autocomplete === 'postal-code') {
        if (profile.zipCode) return { key: 'zipCode', label: 'Postal Code', value: profile.zipCode, confidence: 1 };
      }
      if (autocomplete === 'country' || autocomplete === 'country-name') {
        if (profile.country) return { key: 'country', label: 'Country', value: profile.country, confidence: 1 };
      }
      if (autocomplete === 'organization') {
        if (profile.company) return { key: 'company', label: 'Company', value: profile.company, confidence: 1 };
      }
      if (autocomplete === 'organization-title') {
        if (profile.jobTitle) return { key: 'jobTitle', label: 'Job Title', value: profile.jobTitle, confidence: 1 };
      }
    }

    // 3. Email
    if (
      (fieldType === 'email' || /\b(email|e-mail|electronic\s*mail)\b/i.test(combinedText)) &&
      profile.email
    ) {
      return { key: 'email', label: 'Email Address', value: profile.email, confidence: 0.95 };
    }

    // 4. Phone
    if (
      (fieldType === 'tel' ||
        /\b(phone|mobile|cell|telephone|contact\s*num|contact\s*no|phone\s*num)\b/i.test(combinedText)) &&
      profile.phone
    ) {
      return { key: 'phone', label: 'Phone Number', value: profile.phone, confidence: 0.95 };
    }

    // 5. LinkedIn Profile
    if (
      /\b(linkedin|linked\s*in)\b/i.test(combinedText) &&
      profile.linkedinUrl
    ) {
      return { key: 'linkedinUrl', label: 'LinkedIn Profile', value: profile.linkedinUrl, confidence: 0.95 };
    }

    // 6. GitHub Profile
    if (
      /\b(github|git\s*hub)\b/i.test(combinedText) &&
      profile.githubUrl
    ) {
      return { key: 'githubUrl', label: 'GitHub Profile', value: profile.githubUrl, confidence: 0.95 };
    }

    // 7. Twitter / X Profile
    if (
      /\b(twitter|x\.com)\b/i.test(combinedText) &&
      profile.twitterUrl
    ) {
      return { key: 'twitterUrl', label: 'Twitter / X Profile', value: profile.twitterUrl, confidence: 0.95 };
    }

    // 8. Portfolio / Personal Website
    if (
      /\b(portfolio|personal\s*web|personal\s*site|portfolio\s*url|website|web\s*site|web\s*page|blog)\b/i.test(
        combinedText
      ) &&
      !/\b(company|employer)\b/i.test(combinedText) &&
      (profile.portfolioUrl || profile.website)
    ) {
      return {
        key: 'portfolioUrl',
        label: 'Portfolio / Website',
        value: profile.portfolioUrl || profile.website || '',
        confidence: 0.9,
      };
    }

    // 9. Other Social / Portfolio URL
    if (
      /\b(other\s*link|other\s*website|other\s*url|behance|dribbble|medium\s*url)\b/i.test(combinedText) &&
      profile.otherUrl
    ) {
      return { key: 'otherUrl', label: 'Other Portfolio Link', value: profile.otherUrl, confidence: 0.9 };
    }

    // 10. First Name
    if (
      /\b(first\s*name|given\s*name|fname|forename|prenom)\b/i.test(combinedText) &&
      !/\blast\b/i.test(combinedText)
    ) {
      const val = profile.firstName || (profile.fullName ? profile.fullName.trim().split(/\s+/)[0] : '');
      if (val) return { key: 'firstName', label: 'First Name', value: val, confidence: 0.95 };
    }

    // 11. Last Name
    if (
      /\b(last\s*name|family\s*name|surname|lname)\b/i.test(combinedText) &&
      !/\bfirst\b/i.test(combinedText)
    ) {
      const val =
        profile.lastName ||
        (profile.fullName ? profile.fullName.trim().split(/\s+/).slice(1).join(' ') : '');
      if (val) return { key: 'lastName', label: 'Last Name', value: val, confidence: 0.95 };
    }

    // 12. Full Name
    if (
      (/\b(full\s*name|your\s*name|candidate\s*name|applicant\s*name)\b/i.test(combinedText) ||
        /(^|[^a-z0-9])name($|[^a-z0-9])/i.test(rawLabel || rawName)) &&
      !/\b(first|last|company|employer|user|file|school|college|uni|org|project)\b/i.test(combinedText)
    ) {
      const val = profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
      if (val) return { key: 'fullName', label: 'Full Name', value: val, confidence: 0.9 };
    }

    // 13. Current Job Title / Headline / Designation
    if (
      /\b(current\s*title|job\s*title|current\s*role|designation|current\s*position|headline|role\s*title|current\s*designation)\b/i.test(
        combinedText
      ) &&
      profile.jobTitle
    ) {
      return { key: 'jobTitle', label: 'Job Title', value: profile.jobTitle, confidence: 0.9 };
    }

    // 14. Company / Current Employer
    if (
      /\b(current\s*company|current\s*employer|company\s*name|employer|organization|workplace)\b/i.test(
        combinedText
      ) &&
      !/\b(email|website|url)\b/i.test(combinedText) &&
      profile.company
    ) {
      return { key: 'company', label: 'Current Company', value: profile.company, confidence: 0.9 };
    }

    // 15. Total Experience (Years)
    if (
      /\b(years?\s*of\s*exp|total\s*experience|yoe|experience\s*in\s*years|overall\s*experience)\b/i.test(
        combinedText
      ) &&
      profile.totalExperience
    ) {
      return {
        key: 'totalExperience',
        label: 'Total Experience',
        value: profile.totalExperience,
        confidence: 0.9,
      };
    }

    // 16. Notice Period / Availability / Start Date
    if (
      /\b(notice\s*period|available\s*to\s*start|earliest\s*start\s*date|availability|how\s*soon|start\s*date)\b/i.test(
        combinedText
      ) &&
      (profile.noticePeriod || profile.startDate)
    ) {
      return {
        key: 'noticePeriod',
        label: 'Notice Period / Availability',
        value: profile.noticePeriod || profile.startDate || '',
        confidence: 0.9,
      };
    }

    // 17. Current Salary / CTC
    if (
      /\b(current\s*ctc|current\s*salary|current\s*compensation|present\s*ctc|present\s*salary)\b/i.test(
        combinedText
      ) &&
      profile.currentSalary
    ) {
      return { key: 'currentSalary', label: 'Current Salary / CTC', value: profile.currentSalary, confidence: 0.9 };
    }

    // 18. Expected Salary / Desired CTC
    if (
      /\b(expected\s*ctc|expected\s*salary|desired\s*salary|desired\s*compensation|salary\s*expectation|target\s*salary)\b/i.test(
        combinedText
      ) &&
      profile.expectedSalary
    ) {
      return { key: 'expectedSalary', label: 'Expected Salary / CTC', value: profile.expectedSalary, confidence: 0.9 };
    }

    // 19. Preferred Work Mode (Remote / Hybrid / In-Office)
    if (
      /\b(work\s*mode|workplace\s*type|work\s*preference|work\s*location|remote\s*or\s*hybrid)\b/i.test(
        combinedText
      ) &&
      profile.preferredWorkMode
    ) {
      return { key: 'preferredWorkMode', label: 'Preferred Work Mode', value: profile.preferredWorkMode, confidence: 0.9 };
    }

    // 20. Highest Degree / Qualification
    if (
      /\b(highest\s*degree|highest\s*education|highest\s*qualification|degree|level\s*of\s*education|education\s*level)\b/i.test(
        combinedText
      ) &&
      profile.degree
    ) {
      return { key: 'degree', label: 'Highest Degree', value: profile.degree, confidence: 0.9 };
    }

    // 21. Field of Study / Major / Branch
    if (
      /\b(field\s*of\s*study|major|branch|specialization|discipline|stream)\b/i.test(combinedText) &&
      profile.fieldOfStudy
    ) {
      return { key: 'fieldOfStudy', label: 'Field of Study / Major', value: profile.fieldOfStudy, confidence: 0.9 };
    }

    // 22. University / College / School
    if (
      /\b(university|college|school|institution|institute|alma\s*mater)\b/i.test(combinedText) &&
      profile.university
    ) {
      return { key: 'university', label: 'University / College', value: profile.university, confidence: 0.9 };
    }

    // 23. Graduation Year / End Year
    if (
      /\b(graduation\s*year|year\s*of\s*passing|passout\s*year|completion\s*year|end\s*year)\b/i.test(
        combinedText
      ) &&
      profile.graduationYear
    ) {
      return { key: 'graduationYear', label: 'Graduation Year', value: profile.graduationYear, confidence: 0.9 };
    }

    // 24. GPA / CGPA / Marks
    if (
      /\b(cgpa|gpa|percentage|marks|grade\s*point)\b/i.test(combinedText) &&
      profile.gpa
    ) {
      return { key: 'gpa', label: 'CGPA / GPA', value: profile.gpa, confidence: 0.9 };
    }

    // 25. Skills / Technologies
    if (
      /\b(skills|technologies|tech\s*stack|core\s*competenc|programming\s*languages)\b/i.test(combinedText) &&
      profile.skills
    ) {
      return { key: 'skills', label: 'Key Skills / Technologies', value: profile.skills, confidence: 0.9 };
    }

    // 26. Professional Summary / Bio
    if (
      /\b(summary|about\s*you|about\s*yourself|bio|introduction|overview|profile\s*summary)\b/i.test(
        combinedText
      ) &&
      profile.summary
    ) {
      return { key: 'summary', label: 'Professional Summary', value: profile.summary, confidence: 0.85 };
    }

    // 27. Cover Letter / Pitch / Message to Hiring Team
    if (
      /\b(cover\s*letter|why\s*should\s*we\s*hire|why\s*join|why\s*do\s*you\s*want\s*to\s*work|message\s*to\s*hiring|pitch|note\s*to\s*recruiter|additional\s*information)\b/i.test(
        combinedText
      ) &&
      profile.coverLetter
    ) {
      return { key: 'coverLetter', label: 'Cover Letter / Pitch', value: profile.coverLetter, confidence: 0.9 };
    }

    // 28. Work Authorization (Legally authorized to work?)
    if (
      /\b(authorized\s*to\s*work|legally\s*authorized|eligible\s*to\s*work|right\s*to\s*work)\b/i.test(
        combinedText
      ) &&
      profile.workAuthorization
    ) {
      return {
        key: 'workAuthorization',
        label: 'Work Authorization',
        value: profile.workAuthorization,
        confidence: 0.95,
      };
    }

    // 29. Visa Sponsorship (Require sponsorship now or future?)
    if (
      /\b(require\s*sponsorship|visa\s*sponsorship|sponsorship\s*in\s*the\s*future|will\s*you\s*now\s*or\s*in\s*the\s*future\s*require)\b/i.test(
        combinedText
      ) &&
      profile.visaSponsorship
    ) {
      return {
        key: 'visaSponsorship',
        label: 'Visa Sponsorship Required',
        value: profile.visaSponsorship,
        confidence: 0.95,
      };
    }

    // 30. Willing to Relocate
    if (
      /\b(relocat|willing\s*to\s*relocate)\b/i.test(combinedText) &&
      profile.willingToRelocate
    ) {
      return {
        key: 'willingToRelocate',
        label: 'Willing to Relocate',
        value: profile.willingToRelocate,
        confidence: 0.95,
      };
    }

    // 31. Street Address
    if (
      /\b(street\s*address|address\s*line|residential\s*address|^address$)\b/i.test(combinedText) &&
      profile.address
    ) {
      return { key: 'address', label: 'Address', value: profile.address, confidence: 0.9 };
    }

    // 32. City
    if (
      /\b(city|town)\b/i.test(combinedText) &&
      !/\b(state|country|zip)\b/i.test(combinedText) &&
      profile.city
    ) {
      return { key: 'city', label: 'City', value: profile.city, confidence: 0.9 };
    }

    // 33. State / Province
    if (
      /\b(state|province|region)\b/i.test(combinedText) &&
      !/\b(country|city)\b/i.test(combinedText) &&
      profile.state
    ) {
      return { key: 'state', label: 'State / Province', value: profile.state, confidence: 0.9 };
    }

    // 34. Zip / Postal Code
    if (
      /\b(zip\s*code|postal\s*code|pincode|pin\s*code|^zip$)\b/i.test(combinedText) &&
      profile.zipCode
    ) {
      return { key: 'zipCode', label: 'Zip / Postal Code', value: profile.zipCode, confidence: 0.95 };
    }

    // 35. Country
    if (
      /\b(country|nationality)\b/i.test(combinedText) &&
      profile.country
    ) {
      return { key: 'country', label: 'Country', value: profile.country, confidence: 0.9 };
    }

    // 36. Gender (Optional EEO)
    if (
      /\b(gender|sex)\b/i.test(combinedText) &&
      profile.gender
    ) {
      return { key: 'gender', label: 'Gender', value: profile.gender, confidence: 0.85 };
    }

    // 37. Veteran Status (Optional EEO)
    if (
      /\b(veteran\s*status|military\s*status|protected\s*veteran)\b/i.test(combinedText) &&
      profile.veteranStatus
    ) {
      return { key: 'veteranStatus', label: 'Veteran Status', value: profile.veteranStatus, confidence: 0.85 };
    }

    // 38. Disability Status (Optional EEO)
    if (
      /\b(disability\s*status|individual\s*with\s*a\s*disability)\b/i.test(combinedText) &&
      profile.disabilityStatus
    ) {
      return {
        key: 'disabilityStatus',
        label: 'Disability Status',
        value: profile.disabilityStatus,
        confidence: 0.85,
      };
    }

    return null;
  }

  /**
   * For <select> elements, resolves which option best matches targetValue.
   */
  public static resolveSelectOptionIndex(
    options: Array<{ value: string; text: string }>,
    targetValue: string
  ): number {
    if (!options || options.length === 0 || !targetValue) return -1;
    const target = targetValue.toLowerCase().trim();

    // 1. Exact match on value or text
    for (let i = 0; i < options.length; i++) {
      const val = options[i].value.toLowerCase().trim();
      const txt = options[i].text.toLowerCase().trim();
      if (val === target || txt === target) {
        return i;
      }
    }

    // 2. Boolean-like match for Yes / No questions
    const isYes = /^(yes|true|authorized|1)$/i.test(target);
    const isNo = /^(no|false|unauthorized|0)$/i.test(target);

    if (isYes) {
      for (let i = 0; i < options.length; i++) {
        const txt = options[i].text.toLowerCase().trim();
        const val = options[i].value.toLowerCase().trim();
        if (
          txt.startsWith('yes') ||
          val.startsWith('yes') ||
          txt.includes('authorized') ||
          txt.includes('will not require')
        ) {
          return i;
        }
      }
    } else if (isNo) {
      for (let i = 0; i < options.length; i++) {
        const txt = options[i].text.toLowerCase().trim();
        const val = options[i].value.toLowerCase().trim();
        if (
          txt.startsWith('no') ||
          val.startsWith('no') ||
          txt.includes('not authorized') ||
          txt.includes('will require')
        ) {
          return i;
        }
      }
    }

    // 3. Semantic notice period matching (30 days <=> 1 month, 60 days <=> 2 months, 90 days <=> 3 months, 0 days <=> immediate)
    const is30Days = /\b(30\s*days?|1\s*month)\b/i.test(target);
    const is60Days = /\b(60\s*days?|2\s*months?)\b/i.test(target);
    const is90Days = /\b(90\s*days?|3\s*months?)\b/i.test(target);
    const isImmediate = /\b(immediate|0\s*days?|serving\s*notice)\b/i.test(target);

    if (is30Days || is60Days || is90Days || isImmediate) {
      for (let i = 0; i < options.length; i++) {
        const txt = options[i].text.toLowerCase();
        const val = options[i].value.toLowerCase();
        if (is30Days && (txt.includes('30 day') || txt.includes('1 month') || val.includes('30') || val.includes('1_month'))) return i;
        if (is60Days && (txt.includes('60 day') || txt.includes('2 month') || val.includes('60') || val.includes('2_month'))) return i;
        if (is90Days && (txt.includes('90 day') || txt.includes('3 month') || val.includes('90') || val.includes('3_month'))) return i;
        if (isImmediate && (txt.includes('immediate') || txt.includes('serving') || val.includes('immediate') || val === '0')) return i;
      }
    }

    // 4. Substring match
    for (let i = 0; i < options.length; i++) {
      const val = options[i].value.toLowerCase().trim();
      const txt = options[i].text.toLowerCase().trim();
      if ((val && target.includes(val)) || (txt && target.includes(txt)) || (val && val.includes(target)) || (txt && txt.includes(target))) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Counts how many non-empty fields user has filled in their profile
   */
  public static getFilledCount(profile: UserProfile): number {
    if (!profile) return 0;
    let count = 0;
    for (const [k, v] of Object.entries(profile)) {
      if (k === 'customQuestions') {
        if (Array.isArray(v)) count += v.filter((q) => q.question && q.answer).length;
      } else if (k === 'resume' || k === 'photo') {
        if (v && typeof v === 'object' && (v as any).base64Data) count++;
      } else if (typeof v === 'string' && v.trim().length > 0) {
        count++;
      }
    }
    return count;
  }
}
