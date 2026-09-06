self.addEventListener('fetch', function(event) {
	return;
  });
  
  self.addEventListener('push', function(event) {
	const payload = event.data ? event.data.text() : 'no payload';
	const registration = self.registration;
	
	event.waitUntil(
	  registration.showNotification('KinkyVibe', {
		body: payload
	  })
	);
  });