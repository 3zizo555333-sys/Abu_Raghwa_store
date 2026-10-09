import React, { useState } from 'react';
import { useSecurity } from '@/contexts/SecurityContext';
import PasswordProtectedSection from './PasswordProtectedSection';

export function withPasswordProtection(
  Component: React.ComponentType<any>,
  section: string,
  sectionLabel: string
) {
  return function ProtectedComponent(props: any) {
    const { isPasswordEnabled } = useSecurity();

    if (!isPasswordEnabled(section)) {
      return <Component {...props} />;
    }

    return (
      <PasswordProtectedSection
        section={section}
        sectionLabel={sectionLabel}
      >
        <Component {...props} />
      </PasswordProtectedSection>
    );
  };
}
