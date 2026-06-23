import React, { useState } from 'react';
import { View } from './types';
import Login from '@/components/Login';
import FindAccount from '@/components/FindAccount';
import SignUp from '@/components/SignUp';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [findAccountMode, setFindAccountMode] = useState<'ID' | 'PW'>('ID');

  const handleBackToLogin = () => {
    setCurrentView(View.LOGIN);
  };

  const navigateToFindAccount = (mode: 'ID' | 'PW') => {
    setFindAccountMode(mode);
    setCurrentView(mode === 'ID' ? View.FIND_ID : View.FIND_PW);
  };

  const renderView = () => {
    switch (currentView) {
      case View.LOGIN:
        return (
          <Login 
            onChangeView={(view) => {
              if (view === View.FIND_ID) navigateToFindAccount('ID');
              else if (view === View.FIND_PW) navigateToFindAccount('PW');
              else setCurrentView(view);
            }} 
          />
        );
      case View.FIND_ID:
      case View.FIND_PW:
        return (
          <FindAccount 
            initialMode={currentView === View.FIND_ID ? 'ID' : 'PW'} 
            onBack={handleBackToLogin}
            onChangeMode={(mode) => {
                setFindAccountMode(mode);
                setCurrentView(mode === 'ID' ? View.FIND_ID : View.FIND_PW);
            }}
          />
        );
      case View.SIGN_UP:
        return <SignUp onBack={handleBackToLogin} />;
      default:
        return <Login onChangeView={setCurrentView} />;
    }
  };

  return (
    <div className="bg-gray-100 min-h-screen flex justify-center items-start pt-0 sm:pt-10">
      <div className="w-full max-w-md bg-white sm:rounded-[32px] sm:shadow-2xl overflow-hidden min-h-screen sm:min-h-[840px] sm:h-[840px] relative">
        {renderView()}
      </div>
    </div>
  );
};

export default App;
