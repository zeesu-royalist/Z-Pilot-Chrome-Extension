import { describe, it, expect } from 'vitest';
import { AutofillService } from '../services/autofill-service.js';
import { UserProfile } from '../types/index.js';

describe('AutofillService - Job & Form Autofill Matching Engine', () => {
  const mockProfile: UserProfile = {
    fullName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    phone: '+1 555-0199',
    address: '123 Market Street, Apt 4B',
    city: 'San Francisco',
    state: 'California',
    zipCode: '94105',
    country: 'United States',
    website: 'https://janedoe.dev',
    portfolioUrl: 'https://janedoe.dev',
    linkedinUrl: 'https://linkedin.com/in/janedoe',
    githubUrl: 'https://github.com/janedoe',
    twitterUrl: 'https://x.com/janedoe',
    otherUrl: 'https://behance.net/janedoe',
    jobTitle: 'Senior Software Engineer',
    company: 'Acme Corp',
    totalExperience: '5 years',
    noticePeriod: '15 Days',
    currentSalary: '$120,000',
    expectedSalary: '$150,000',
    preferredWorkMode: 'Remote',
    startDate: 'Immediate',
    degree: 'Bachelor of Technology in Computer Science',
    fieldOfStudy: 'Computer Science & Engineering',
    university: 'Stanford University',
    graduationYear: '2020',
    gpa: '3.9 / 4.0',
    skills: 'React, TypeScript, Node.js, Python, AWS, Docker',
    summary: 'Full-stack software engineer with 5 years experience specializing in cloud-native React applications.',
    coverLetter: 'Dear Hiring Team, I am thrilled to apply. With 5 years of TypeScript and React experience, I am confident in delivering value.',
    workAuthorization: 'Yes',
    visaSponsorship: 'No',
    willingToRelocate: 'Yes',
    gender: 'Female',
    veteranStatus: 'Not a veteran',
    disabilityStatus: 'No',
    customQuestions: [
      {
        id: '1',
        question: 'What is your primary programming language?',
        answer: 'TypeScript & Python',
      },
      {
        id: '2',
        question: 'GitHub Username',
        answer: 'janedoe',
      },
    ],
  };

  describe('1. Personal & Contact Information Matching', () => {
    it('matches First Name with explicit first name label or fname', () => {
      const match = AutofillService.matchField(
        { label: 'First Name *', name: 'fname', type: 'text' },
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.key).toBe('firstName');
      expect(match?.value).toBe('Jane');
    });

    it('matches Last Name with surname or family name', () => {
      const match = AutofillService.matchField(
        { label: 'Family Name / Surname', name: 'last_name', type: 'text' },
        mockProfile
      );
      expect(match).not.toBeNull();
      expect(match?.key).toBe('lastName');
      expect(match?.value).toBe('Doe');
    });

    it('splits Full Name into first and last name if individual names are missing', () => {
      const profileWithoutFirstLast: UserProfile = {
        fullName: 'Alex Morgan',
      };
      const matchFirst = AutofillService.matchField(
        { label: 'First Name', name: 'first_name', type: 'text' },
        profileWithoutFirstLast
      );
      expect(matchFirst?.value).toBe('Alex');

      const matchLast = AutofillService.matchField(
        { label: 'Last Name', name: 'last_name', type: 'text' },
        profileWithoutFirstLast
      );
      expect(matchLast?.value).toBe('Morgan');
    });

    it('matches Email input by type="email" or label', () => {
      const match1 = AutofillService.matchField(
        { label: 'Email Address', name: 'user_email', type: 'email' },
        mockProfile
      );
      expect(match1?.value).toBe('jane.doe@example.com');

      const match2 = AutofillService.matchField(
        { label: 'E-mail', name: 'contact_email', type: 'text' },
        mockProfile
      );
      expect(match2?.value).toBe('jane.doe@example.com');
    });

    it('matches Phone Number by tel type or phone label', () => {
      const match = AutofillService.matchField(
        { label: 'Mobile Phone Number', name: 'phone_num', type: 'tel' },
        mockProfile
      );
      expect(match?.value).toBe('+1 555-0199');
    });

    it('matches Address, City, State, Country, and Postal Code', () => {
      expect(
        AutofillService.matchField({ label: 'Street Address', name: 'street' }, mockProfile)?.value
      ).toBe('123 Market Street, Apt 4B');

      expect(
        AutofillService.matchField({ label: 'City', name: 'city_name' }, mockProfile)?.value
      ).toBe('San Francisco');

      expect(
        AutofillService.matchField({ label: 'State / Province', name: 'state' }, mockProfile)?.value
      ).toBe('California');

      expect(
        AutofillService.matchField({ label: 'Zip Code / Postal Code', name: 'postal' }, mockProfile)?.value
      ).toBe('94105');

      expect(
        AutofillService.matchField({ label: 'Country', name: 'country' }, mockProfile)?.value
      ).toBe('United States');
    });
  });

  describe('2. Online Presence & Social Links', () => {
    it('matches LinkedIn Profile URL', () => {
      const match = AutofillService.matchField(
        { label: 'LinkedIn Profile URL', name: 'linkedin_url', placeholder: 'https://linkedin.com/in/...' },
        mockProfile
      );
      expect(match?.key).toBe('linkedinUrl');
      expect(match?.value).toBe('https://linkedin.com/in/janedoe');
    });

    it('matches GitHub Profile URL', () => {
      const match = AutofillService.matchField(
        { label: 'GitHub Profile', name: 'github_profile' },
        mockProfile
      );
      expect(match?.key).toBe('githubUrl');
      expect(match?.value).toBe('https://github.com/janedoe');
    });

    it('matches Personal Website / Portfolio URL without matching company website', () => {
      const match = AutofillService.matchField(
        { label: 'Portfolio Website', name: 'portfolio_url' },
        mockProfile
      );
      expect(match?.key).toBe('portfolioUrl');
      expect(match?.value).toBe('https://janedoe.dev');
    });
  });

  describe('3. Job Experience & Preferences', () => {
    it('matches Current Job Title / Role', () => {
      const match = AutofillService.matchField(
        { label: 'Current Job Title / Designation', name: 'current_role' },
        mockProfile
      );
      expect(match?.key).toBe('jobTitle');
      expect(match?.value).toBe('Senior Software Engineer');
    });

    it('matches Current Employer / Company', () => {
      const match = AutofillService.matchField(
        { label: 'Current Employer / Company Name', name: 'company' },
        mockProfile
      );
      expect(match?.key).toBe('company');
      expect(match?.value).toBe('Acme Corp');
    });

    it('matches Total Experience in Years', () => {
      const match = AutofillService.matchField(
        { label: 'Total Years of Experience (YOE)', name: 'total_experience' },
        mockProfile
      );
      expect(match?.key).toBe('totalExperience');
      expect(match?.value).toBe('5 years');
    });

    it('matches Notice Period / Earliest Start Date', () => {
      const match = AutofillService.matchField(
        { label: 'What is your current notice period?', name: 'notice_period' },
        mockProfile
      );
      expect(match?.key).toBe('noticePeriod');
      expect(match?.value).toBe('15 Days');
    });

    it('matches Expected CTC / Desired Salary', () => {
      const match = AutofillService.matchField(
        { label: 'Expected Salary / Desired CTC', name: 'expected_salary' },
        mockProfile
      );
      expect(match?.key).toBe('expectedSalary');
      expect(match?.value).toBe('$150,000');
    });
  });

  describe('4. Education Matching', () => {
    it('matches Highest Degree', () => {
      const match = AutofillService.matchField(
        { label: 'Highest Degree / Level of Education', name: 'degree' },
        mockProfile
      );
      expect(match?.key).toBe('degree');
      expect(match?.value).toBe('Bachelor of Technology in Computer Science');
    });

    it('matches University / College Name', () => {
      const match = AutofillService.matchField(
        { label: 'College / University Name', name: 'institution' },
        mockProfile
      );
      expect(match?.key).toBe('university');
      expect(match?.value).toBe('Stanford University');
    });

    it('matches Graduation Year and GPA', () => {
      expect(
        AutofillService.matchField({ label: 'Year of Passing / Graduation Year' }, mockProfile)?.value
      ).toBe('2020');

      expect(
        AutofillService.matchField({ label: 'Cumulative GPA / CGPA' }, mockProfile)?.value
      ).toBe('3.9 / 4.0');
    });
  });

  describe('5. Skills, Pitch & Cover Letter', () => {
    it('matches Skills and Technologies list', () => {
      const match = AutofillService.matchField(
        { label: 'Key Skills / Technologies (comma separated)', name: 'skills' },
        mockProfile
      );
      expect(match?.key).toBe('skills');
      expect(match?.value).toBe('React, TypeScript, Node.js, Python, AWS, Docker');
    });

    it('matches Cover Letter / Pitch textarea', () => {
      const match = AutofillService.matchField(
        { label: 'Cover Letter / Why should we hire you?', type: 'textarea' },
        mockProfile
      );
      expect(match?.key).toBe('coverLetter');
      expect(match?.value).toContain('Dear Hiring Team');
    });
  });

  describe('6. Work Authorization & Legal Questions', () => {
    it('matches Work Authorization questions', () => {
      const match = AutofillService.matchField(
        { label: 'Are you legally authorized to work in this country?', name: 'work_auth' },
        mockProfile
      );
      expect(match?.key).toBe('workAuthorization');
      expect(match?.value).toBe('Yes');
    });

    it('matches Visa Sponsorship questions', () => {
      const match = AutofillService.matchField(
        { label: 'Will you now or in the future require visa sponsorship?', name: 'visa_sponsorship' },
        mockProfile
      );
      expect(match?.key).toBe('visaSponsorship');
      expect(match?.value).toBe('No');
    });
  });

  describe('7. Custom Q&A Pairs', () => {
    it('matches user-defined custom questions by phrase', () => {
      const match = AutofillService.matchField(
        { label: 'What is your primary programming language? *', name: 'custom_lang' },
        mockProfile
      );
      expect(match?.key).toBe('custom_1');
      expect(match?.value).toBe('TypeScript & Python');
    });

    it('matches custom username question', () => {
      const match = AutofillService.matchField(
        { label: 'Enter your GitHub Username', name: 'gh_handle' },
        mockProfile
      );
      expect(match?.key).toBe('custom_2');
      expect(match?.value).toBe('janedoe');
    });
  });

  describe('8. Smart Select & Dropdown Resolution', () => {
    const booleanOptions = [
      { value: '', text: 'Select an option' },
      { value: 'yes', text: 'Yes, I am authorized' },
      { value: 'no', text: 'No, I am not authorized' },
    ];

    it('resolves Yes option correctly', () => {
      const idx = AutofillService.resolveSelectOptionIndex(booleanOptions, 'Yes');
      expect(idx).toBe(1);
    });

    it('resolves No option correctly', () => {
      const idx = AutofillService.resolveSelectOptionIndex(booleanOptions, 'No');
      expect(idx).toBe(2);
    });

    it('resolves degree dropdowns via substring match', () => {
      const degreeOptions = [
        { value: 'high_school', text: 'High School' },
        { value: 'associate', text: 'Associate Degree' },
        { value: 'bachelor', text: 'Bachelor of Science / Engineering / B.Tech' },
        { value: 'master', text: 'Master of Science' },
      ];
      const idx = AutofillService.resolveSelectOptionIndex(degreeOptions, 'Bachelor of Technology');
      expect(idx).toBe(2);
    });

    it('resolves notice period options semantically (e.g. 30 days <=> 1 month, 15 days or less)', () => {
      const noticeOptions = [
        { value: 'none', text: 'Select Notice Period' },
        { value: 'opt_15', text: '15 Days or less' },
        { value: 'opt_30', text: '1 Month' },
        { value: 'opt_60', text: '2 Months' },
      ];
      expect(AutofillService.resolveSelectOptionIndex(noticeOptions, '15 Days')).toBe(1);
      expect(AutofillService.resolveSelectOptionIndex(noticeOptions, '30 Days')).toBe(2);
      expect(AutofillService.resolveSelectOptionIndex(noticeOptions, '1 month')).toBe(2);
      expect(AutofillService.resolveSelectOptionIndex(noticeOptions, '60 days')).toBe(3);
    });
  });

  describe('9. Security & Safety', () => {
    it('strictly avoids matching password inputs', () => {
      const match = AutofillService.matchField(
        { label: 'Password', name: 'password', type: 'password' },
        mockProfile
      );
      expect(match).toBeNull();
    });

    it('strictly avoids filling search boxes or search query inputs', () => {
      const match1 = AutofillService.matchField(
        { label: 'Search jobs', name: 'search', type: 'search', placeholder: 'Search by job title or keyword' },
        mockProfile
      );
      expect(match1).toBeNull();

      const match2 = AutofillService.matchField(
        { label: 'Query', name: 'search_query', placeholder: 'Search here...' },
        mockProfile
      );
      expect(match2).toBeNull();
    });

    it('sanitizes formatted numbers for input[type="number"] (e.g. $150,000 -> 150000, 5 years -> 5)', () => {
      expect(AutofillService.sanitizeValueForField('$150,000', 'number')).toBe('150000');
      expect(AutofillService.sanitizeValueForField('5 years', 'number')).toBe('5');
      expect(AutofillService.sanitizeValueForField('4.5 years', 'number')).toBe('4.5');
      expect(AutofillService.sanitizeValueForField('React, TypeScript', 'text')).toBe('React, TypeScript');
    });

    it('ignores empty fields in profile so they never overwrite webpage fields with blank strings', () => {
      const emptyProfile: UserProfile = {
        fullName: 'Jane Doe',
        company: '', // empty
      };
      const match = AutofillService.matchField(
        { label: 'Company / Employer', name: 'company' },
        emptyProfile
      );
      expect(match).toBeNull();
    });
  });

  describe('10. Resume & CV File Matching', () => {
    it('matches resume file input when profile has resume attached', () => {
      const profileWithResume: UserProfile = {
        ...mockProfile,
        resume: {
          fileName: 'Jane_Doe_Resume.pdf',
          fileType: 'application/pdf',
          fileSize: 102400,
          base64Data: 'data:application/pdf;base64,JVBERi0xLjQK...',
          uploadedAt: Date.now(),
        },
      };

      const matched = AutofillService.matchField(
        {
          id: 'resume-upload',
          name: 'resume',
          type: 'file',
          label: 'Upload Resume / CV',
        },
        profileWithResume
      );

      expect(matched).not.toBeNull();
      expect(matched?.key).toBe('resume');
      expect(matched?.value).toBe('Jane_Doe_Resume.pdf');
    });

    it('ignores non-resume file inputs like avatar, photo, cover letter, and portfolio', () => {
      const profileWithResume: UserProfile = {
        ...mockProfile,
        resume: {
          fileName: 'Jane_Doe_Resume.pdf',
          fileType: 'application/pdf',
          fileSize: 102400,
          base64Data: 'data:application/pdf;base64,JVBERi0xLjQK...',
          uploadedAt: Date.now(),
        },
      };

      // Photo
      const matchPhoto = AutofillService.matchField(
        { id: 'avatar-pic', name: 'profile_photo', type: 'file', label: 'Upload Profile Photo' },
        profileWithResume
      );
      expect(matchPhoto).toBeNull();

      // Cover letter file input
      const matchCoverLetter = AutofillService.matchField(
        { id: 'cover-letter-file', name: 'cover_letter', type: 'file', label: 'Upload Cover Letter (Optional)' },
        profileWithResume
      );
      expect(matchCoverLetter).toBeNull();

      // Portfolio file input
      const matchPortfolio = AutofillService.matchField(
        { id: 'portfolio-file', name: 'portfolio_doc', type: 'file', label: 'Attach Work Sample / Portfolio' },
        profileWithResume
      );
      expect(matchPortfolio).toBeNull();

      // Generic document upload without resume keyword
      const matchGeneric = AutofillService.matchField(
        { id: 'misc-attachment', name: 'attachment', type: 'file', label: 'Additional Documents' },
        profileWithResume
      );
      expect(matchGeneric).toBeNull();
    });

    it('counts stored resume in getFilledCount', () => {
      const profileWithResume: UserProfile = {
        ...mockProfile,
        resume: {
          fileName: 'Jane_Doe_Resume.pdf',
          fileType: 'application/pdf',
          fileSize: 102400,
          base64Data: 'data:application/pdf;base64,JVBERi0xLjQK...',
          uploadedAt: Date.now(),
        },
      };

      const countWithout = AutofillService.getFilledCount(mockProfile);
      const countWith = AutofillService.getFilledCount(profileWithResume);
      expect(countWith).toBe(countWithout + 1);
    });

    it('matches passport size photo file input when profile has photo attached', () => {
      const profileWithPhoto: UserProfile = {
        ...mockProfile,
        photo: {
          fileName: 'Jane_Passport.jpg',
          fileType: 'image/jpeg',
          fileSize: 45000,
          base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
          uploadedAt: Date.now(),
        },
      };

      const matched = AutofillService.matchField(
        {
          id: 'applicant-photo',
          name: 'passport_photo',
          type: 'file',
          label: 'Upload Passport Size Photo',
        },
        profileWithPhoto
      );

      expect(matched).not.toBeNull();
      expect(matched?.key).toBe('photo');
      expect(matched?.value).toBe('Jane_Passport.jpg');
    });

    it('counts both stored resume and photo in getFilledCount', () => {
      const profileWithBoth: UserProfile = {
        ...mockProfile,
        resume: {
          fileName: 'Jane_Doe_Resume.pdf',
          fileType: 'application/pdf',
          fileSize: 102400,
          base64Data: 'data:application/pdf;base64,JVBERi0xLjQK...',
          uploadedAt: Date.now(),
        },
        photo: {
          fileName: 'Jane_Passport.jpg',
          fileType: 'image/jpeg',
          fileSize: 45000,
          base64Data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
          uploadedAt: Date.now(),
        },
      };

      const countWithout = AutofillService.getFilledCount(mockProfile);
      const countWithBoth = AutofillService.getFilledCount(profileWithBoth);
      expect(countWithBoth).toBe(countWithout + 2);
    });
  });
});
