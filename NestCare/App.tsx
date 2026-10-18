/**
 * NestCare — patient-facing mobile app
 *
 * @format
 */

import React from 'react';
import { StatusBar, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { FONT } from './src/theme';

// App-wide default font (DM Sans, same as NestHR) for any Text / TextInput without an explicit family.
(Text as any).defaultProps = (Text as any).defaultProps || {};
(Text as any).defaultProps.style = [
  { fontFamily: FONT.medium },
  (Text as any).defaultProps.style,
];
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.style = [
  { fontFamily: FONT.medium },
  (TextInput as any).defaultProps.style,
];

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;
