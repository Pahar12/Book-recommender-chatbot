# BookWise AI — UI/UX Integration Quick Reference

## 🚀 Quick Start

All UI/UX utilities are automatically available in `app.js`. Use them directly in your code:

```javascript
// Notification
NotificationManager.success("Action completed!");

// Loading
FeedbackManager.showLoadingState(button);

// Error
ErrorHandler.display("Something went wrong");

// Validation
ValidationHelper.validateInput(message);
```

---

## 📋 Common Patterns

### Pattern 1: Send Message with UI Feedback

```javascript
async function sendMessage() {
    const message = elements.messageInput.value;
    
    // Validate
    if (!ValidationHelper.validateInput(message, 1, 5000)) {
        return;
    }
    
    // Show loading
    FeedbackManager.showLoadingState(elements.sendBtn, "Sending...");
    A11yHelper.announceToScreenReader("Sending message", "polite");
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) throw new Error('Failed to send');
        
        // Success
        FeedbackManager.hideLoadingState(elements.sendBtn);
        NotificationManager.success("Message sent!");
        AnalyticsHelper.trackMessageSent(message.length);
        
        // Clear input
        elements.messageInput.value = '';
        
    } catch (error) {
        FeedbackManager.hideLoadingState(elements.sendBtn);
        ErrorHandler.handle(error, "Failed to send message");
    }
}
```

### Pattern 2: Upload File with Validation

```javascript
async function handleFileUpload(file) {
    // Validate size
    if (!ValidationHelper.validateFileSize(file, 50)) {
        return;
    }
    
    // Validate type
    if (!ValidationHelper.validateFileType(file)) {
        return;
    }
    
    // Show loading
    const formData = new FormData();
    formData.append('file', file);
    
    const indicator = LoadingManager.createLoadingIndicator("Uploading...");
    elements.uploadStatus.innerHTML = '';
    elements.uploadStatus.appendChild(indicator);
    elements.uploadStatus.style.display = 'block';
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        // Success
        elements.uploadStatus.innerHTML = '✓ Upload successful!';
        NotificationManager.success("Document ready for Q&A");
        AnalyticsHelper.trackFeatureUsed("document_upload");
        
        setTimeout(() => {
            elements.uploadStatus.style.display = 'none';
        }, 2000);
        
    } catch (error) {
        ErrorHandler.handle(error, "Upload failed");
        elements.uploadStatus.style.display = 'none';
    }
}
```

### Pattern 3: Display Loading State During Stream

```javascript
function handleStreamingResponse(messageId, reader) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    messageElement.classList.add('streaming');
    
    const loadingIndicator = LoadingManager.createLoadingIndicator();
    messageElement.appendChild(loadingIndicator);
    
    // Stream content...
    
    // When done
    messageElement.classList.remove('streaming');
    loadingIndicator.remove();
    NotificationManager.success("Response complete");
}
```

### Pattern 4: Form Validation with Error Display

```javascript
function handleFormSubmit(event) {
    event.preventDefault();
    
    const emailInput = document.querySelector('#email');
    const messageInput = document.querySelector('#message');
    
    // Clear previous errors
    A11yHelper.clearFieldError(emailInput);
    A11yHelper.clearFieldError(messageInput);
    
    // Validate
    const isValid = validateForm();
    
    if (!isValid) {
        A11yHelper.announceToScreenReader("Form has errors", "assertive");
        return;
    }
    
    // Submit form...
}

function validateForm() {
    let isValid = true;
    
    const emailInput = document.querySelector('#email');
    if (!emailInput.value.includes('@')) {
        A11yHelper.setFieldError(emailInput, 'Invalid email address');
        isValid = false;
    }
    
    return isValid;
}
```

### Pattern 5: Mobile Responsive Behavior

```javascript
function initializeUI() {
    if (MobileHelper.isSmallScreen()) {
        // Apply mobile optimizations
        document.querySelector('.sidebar').classList.add('mobile-sidebar');
        
        // Make buttons bigger for touch
        Array.from(document.querySelectorAll('button')).forEach(btn => {
            MobileHelper.optimizeForTouch(btn);
        });
    }
    
    // Check for touch device
    if (MobileHelper.isTouchDevice()()) {
        // Enable touch-friendly features
        document.body.classList.add('touch-device');
    }
}
```

### Pattern 6: Animate Elements

```javascript
function showNewMessage(messageElement) {
    // Fade in
    AnimationHelper.fadeIn(messageElement, 300);
    
    // Or slide in
    AnimationHelper.slideIn(messageElement, "up", 300);
}

function removeOldMessage(messageElement) {
    // Fade out and remove
    AnimationHelper.fadeOut(messageElement, 300);
}
```

### Pattern 7: Track User Actions

```javascript
// Send message
elements.sendBtn.addEventListener('click', () => {
    AnalyticsHelper.trackMessageSent(message.length);
});

// Feature usage
elements.voiceBtn.addEventListener('click', () => {
    AnalyticsHelper.trackFeatureUsed("voice_input");
});

// Custom events
document.querySelector('#bookCategory').addEventListener('click', (e) => {
    AnalyticsHelper.trackEvent("book_category", {
        category: e.target.dataset.category,
        timestamp: new Date().toISOString()
    });
});
```

### Pattern 8: Screen Reader Announcements

```javascript
function updateChatCounter(count) {
    elements.msgCounter.textContent = `${count} messages`;
    A11yHelper.announceToScreenReader(`Chat has ${count} messages`, "polite");
}

function showCriticalError(message) {
    ErrorHandler.display(message);
    A11yHelper.announceToScreenReader(`Error: ${message}`, "assertive");
}
```

---

## 🎯 Best Practices

### ✅ Do's

- ✅ Use `NotificationManager` for user feedback
- ✅ Show loading states during async operations
- ✅ Validate input before processing
- ✅ Announce important changes to screen readers
- ✅ Provide accessible error messages
- ✅ Use semantic HTML and ARIA
- ✅ Test on mobile devices
- ✅ Test with screen readers
- ✅ Provide keyboard navigation
- ✅ Track user actions

### ❌ Don'ts

- ❌ Don't rely on color alone for meaning
- ❌ Don't block UI without showing loading state
- ❌ Don't ignore validation errors
- ❌ Don't use generic error messages
- ❌ Don't forget about keyboard users
- ❌ Don't auto-hide important messages
- ❌ Don't make touch targets too small
- ❌ Don't forget screen readers
- ❌ Don't break focus management
- ❌ Don't ignore accessibility

---

## 🔧 API Reference

### NotificationManager

```javascript
// Show notification
NotificationManager.show(message, type, duration);

// Shortcuts
NotificationManager.success(message);  // Green, checkmark
NotificationManager.error(message);    // Red, X
NotificationManager.warning(message);  // Yellow, warning
NotificationManager.info(message);     // Blue, info

// Returns: toast element (can be stored)
const toast = NotificationManager.success("Done!");
```

### LoadingManager

```javascript
// Create spinner
const spinner = LoadingManager.createSpinner();

// Create full loading indicator
const indicator = LoadingManager.createLoadingIndicator("Processing...");

// Add to message
const message = document.querySelector('.message');
LoadingManager.addToMessage(message);
```

### ErrorHandler

```javascript
// Display error
ErrorHandler.display(message, container);

// Handle error
ErrorHandler.handle(error, fallbackMessage);
```

### ValidationHelper

```javascript
// Validate input
ValidationHelper.validateInput(text, minLength, maxLength);

// Validate file
ValidationHelper.validateFileSize(file, maxMB);
ValidationHelper.validateFileType(file, allowedTypes);
```

### A11yHelper

```javascript
// Announce to screen reader
A11yHelper.announceToScreenReader(message, priority);
// priority: "polite" (default) or "assertive"

// Set field error
A11yHelper.setFieldError(input, errorMessage);

// Clear field error
A11yHelper.clearFieldError(input);
```

### FeedbackManager

```javascript
// Copy feedback
FeedbackManager.showCopyFeedback(element);

// Button loading
FeedbackManager.showLoadingState(button, text);
FeedbackManager.hideLoadingState(button);

// Pulse animation
FeedbackManager.pulseElement(element);
```

### AnimationHelper

```javascript
// Fade in
AnimationHelper.fadeIn(element, duration);

// Fade out (removes element)
AnimationHelper.fadeOut(element, duration);

// Slide in
AnimationHelper.slideIn(element, direction, duration);
// direction: "up", "down", "left", "right"
```

### AnalyticsHelper

```javascript
// Track custom event
AnalyticsHelper.trackEvent(eventName, data);

// Track message
AnalyticsHelper.trackMessageSent(length);

// Track feature
AnalyticsHelper.trackFeatureUsed(feature);
```

### A11yHelper & MobileHelper

```javascript
// Check screen size
MobileHelper.isSmallScreen();  // < 768px

// Check touch device
MobileHelper.isTouchDevice();

// Optimize for touch
MobileHelper.optimizeForTouch(element);
```

---

## 🎨 CSS Classes Reference

### Interactive States
- `.hover-lift` — Lift on hover
- `.hover-glow` — Glow on hover
- `.transition-smooth` — Smooth transitions
- `.ripple` — Ripple effect on click

### Loading & Feedback
- `.loading-spinner` — Animated spinner
- `.loading-indicator` — Full loading indicator
- `.message.streaming` — Pulse during generation
- `.skeleton` — Shimmer loader

### Notifications
- `.error-message` — Red error box
- `.success-message` — Green success box
- `.warning-message` — Yellow warning box
- `.toast` — Toast notification
- `.toast.error`, `.toast.success`, `.toast.warning`, `.toast.info` — Colored variants

### Empty States
- `.empty-state` — Container
- `.empty-state-icon` — Icon element
- `.empty-state-title` — Title
- `.empty-state-text` — Description

---

## 🧪 Testing Checklist

### Functionality
- [ ] Notifications appear and auto-dismiss
- [ ] Loading states show during async operations
- [ ] Errors display with close button
- [ ] Form validation works correctly
- [ ] File upload validates size and type
- [ ] Success messages appear on completion

### Accessibility
- [ ] Tab navigation works throughout app
- [ ] Focus indicators visible on all elements
- [ ] Screen reader announces messages
- [ ] ARIA labels are present
- [ ] Keyboard shortcuts work
- [ ] Color contrast meets WCAG AA
- [ ] Skip links work

### Mobile
- [ ] Layout works on mobile (< 480px)
- [ ] Touch targets are 44px+
- [ ] No horizontal scrolling
- [ ] Sidebar slides in/out correctly
- [ ] Text remains readable on mobile
- [ ] Buttons easy to tap

### Visual
- [ ] Animations are smooth (60fps)
- [ ] No layout shifts
- [ ] Hover effects work
- [ ] Focus states visible
- [ ] Empty states show helpful messages
- [ ] Error messages are clear

---

## 🚀 Deployment Checklist

- [ ] All utilities are in `static/js/app.js`
- [ ] All CSS is in `static/css/style.css`
- [ ] HTML has proper ARIA labels
- [ ] No console errors
- [ ] Accessibility audit passes
- [ ] Mobile responsive verified
- [ ] Performance optimized
- [ ] Analytics tracking works
- [ ] Documentation complete
- [ ] Ready for production

---

**Last Updated**: 2024  
**Version**: 2.1  
**Status**: Ready to Use
