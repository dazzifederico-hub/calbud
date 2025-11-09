
import React, { useState, useEffect, useCallback } from 'react';
import type { Page, Transaction, GapiCredentials, AppSettings, ColorMapping } from './types';
import { TransactionType } from './types';

import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import EntratePage from './pages/EntratePage';
import UscitePage from './pages/UscitePage';
import StatsPage from './pages/StatsPage';
import SettingsPage from './pages/SettingsPage';

import * as db from './services/db';
import * as gcal from './services/googleCalendar';

const App: React.FC = () => {
    const [page, setPage] = useState<Page>('home');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [settings, setSettings] = useState<AppSettings>({ colorMappings: [] });
    const [gapiCreds, setGapiCreds] = useState<GapiCredentials | null>(null);
    const [isGapiReady, setIsGapiReady] = useState(false);
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const loadDataFromDb = useCallback(async () => {
        const [dbTransactions, dbSettings, dbCreds] = await Promise.all([
            db.getTransactions(),
            db.getSettings(),
            db.getGapiCredentials(),
        ]);
        setTransactions(dbTransactions || []);
        setSettings(dbSettings || { colorMappings: [] });
        setGapiCreds(dbCreds || null);
    }, []);

    const updateAuthStatus = useCallback((signedIn: boolean) => {
        setIsSignedIn(signedIn);
    }, []);

    const initGoogleApi = useCallback(async (creds: GapiCredentials) => {
        await gcal.loadGapiClient();
        await gcal.initGapiClient(creds);
        setIsGapiReady(true);
        const authInstance = gcal.getAuthInstance();
        authInstance.isSignedIn.listen(updateAuthStatus);
        updateAuthStatus(authInstance.isSignedIn.get());
    }, [updateAuthStatus]);

    useEffect(() => {
        const initializeApp = async () => {
            setIsLoading(true);
            await db.initDB();
            await loadDataFromDb();
            const creds = await db.getGapiCredentials();
            if (creds) {
                await initGoogleApi(creds);
            }
            setIsLoading(false);
        };
        initializeApp();
    }, [loadDataFromDb, initGoogleApi]);

    const syncWithCalendar = useCallback(async () => {
        if (!isSignedIn || !isGapiReady || !settings.colorMappings.length) return;
        console.log("Starting calendar sync...");
        try {
            const events = await gcal.fetchEvents(settings.lastSync);
            let newTransactionsCount = 0;
            for (const event of events) {
                if (!event.colorId || !event.start) continue;

                const eventDate = event.start.date || (event.start.dateTime ? event.start.dateTime.split('T')[0] : null);
                if (!eventDate) continue;
                
                const mapping = settings.colorMappings.find(m => m.colorId === event.colorId);
                if (mapping) {
                    const existingTransaction = await db.getTransactionByEventId(event.id);
                    if (!existingTransaction) {
                        await db.addTransaction({
                            type: mapping.type,
                            description: mapping.description || event.summary,
                            amount: mapping.amount,
                            date: eventDate,
                            source: 'calendar',
                            calendarEventId: event.id
                        });
                        newTransactionsCount++;
                    }
                }
            }
            if (newTransactionsCount > 0) {
                 await loadDataFromDb();
            }
            const newSyncTime = new Date().toISOString();
            const newSettings = { ...settings, lastSync: newSyncTime };
            await db.saveSettings(newSettings);
            setSettings(newSettings);
            console.log("Sync completed. New transactions:", newTransactionsCount);

        } catch (error) {
            console.error("Error during calendar sync:", error);
        }
    }, [isSignedIn, isGapiReady, settings, loadDataFromDb]);
    
    useEffect(() => {
        const interval = setInterval(() => {
            syncWithCalendar();
        }, 5 * 60 * 1000); // 5 minutes
        return () => clearInterval(interval);
    }, [syncWithCalendar]);


    const handleSignIn = async () => {
        if (!isGapiReady) return;
        await gcal.signIn();
        syncWithCalendar();
    };

    const handleSignOut = async () => {
        if (!isGapiReady) return;
        await gcal.signOut();
    };

    const handleAddTransaction = async (transaction: Omit<Transaction, 'id'>) => {
        await db.addTransaction(transaction);
        await loadDataFromDb();
    };

    const handleDeleteTransaction = async (id: number) => {
        await db.deleteTransaction(id);
        await loadDataFromDb();
    };

    const handleSaveGapiCreds = async (creds: GapiCredentials) => {
        await db.saveGapiCredentials(creds);
        setGapiCreds(creds);
        await initGoogleApi(creds);
        alert('Credenziali salvate. Ora puoi sincronizzare con Google Calendar.');
    };

    const handleDeleteGapiCreds = async () => {
        await db.deleteGapiCredentials();
        setGapiCreds(null);
        setIsGapiReady(false);
        if (isSignedIn) await gcal.signOut();
    };
    
    const handleSaveAppSettings = async (newSettings: AppSettings) => {
        await db.saveSettings(newSettings);
        setSettings(newSettings);
    };

    const renderPage = () => {
        switch (page) {
            case 'home':
                return <HomePage transactions={transactions} addTransaction={handleAddTransaction} />;
            case 'income':
                return <EntratePage transactions={transactions} deleteTransaction={handleDeleteTransaction} />;
            case 'expenses':
                return <UscitePage transactions={transactions} deleteTransaction={handleDeleteTransaction} />;
            case 'stats':
                return <StatsPage transactions={transactions} />;
            case 'settings':
                return <SettingsPage
                    gapiCreds={gapiCreds}
                    settings={settings}
                    isSignedIn={isSignedIn}
                    signIn={handleSignIn}
                    signOut={handleSignOut}
                    saveGapiCredentials={handleSaveGapiCreds}
                    deleteGapiCredentials={handleDeleteGapiCreds}
                    saveAppSettings={handleSaveAppSettings}
                    />;
            default:
                return <HomePage transactions={transactions} addTransaction={handleAddTransaction} />;
        }
    };
    
    if (isLoading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    return (
        <div className="h-screen w-screen overflow-y-auto pb-16 bg-gray-50">
            <main>
                {renderPage()}
            </main>
            <BottomNav activePage={page} setPage={setPage} />
        </div>
    );
};

export default App;
