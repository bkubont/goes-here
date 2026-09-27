import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// Remounts should pick up writes from other screens.
			refetchOnMount: true,
			retry: 1,
		},
	},
});