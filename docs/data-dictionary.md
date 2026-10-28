# Wellspring Data Dictionary (updated)

This dictionary matches `database/wellspring.sql` column for column. It is the planning document's data dictionary with three updates:

- **One database.** Both groups of tables live in the same PostgreSQL database, so the two FK\* links that the program had to check are now real foreign keys (marked ✱ below).
- **Data types.** Every column now has its PostgreSQL type.
- **History table name.** The plan's ER diagram called it "Note" and its data dictionary called it StatusUpdate. It is `status_update`.

Key: **PK** primary key · **FK** foreign key · **UQ** unique. "Not blank" means the value cannot be empty or only spaces.

## Maintenance

### person
Anyone who reports a problem, handles it, writes a status update, or signs for a delivery.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| person_id | int (identity) | PK | Yes | Created by the database; never reused |
| full_name | text | | Yes | Not blank |
| person_type | text | | Yes | Staff, Volunteer, or Board |
| email | text | | No | Must contain @ when filled in |
| phone | text | | No | Digits, spaces, dashes and parentheses only |

### room
A room or space at Wellspring where a problem can happen.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| room_id | int (identity) | PK | Yes | Created by the database |
| room_name | text | UQ | Yes | Unique; not blank (Rule 6) |
| floor | text | | Yes | Not blank |
| is_active | boolean | | Yes | Default true. Closed rooms are set to false, not deleted |

### category
A kind of problem, used to group similar requests.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| category_id | int (identity) | PK | Yes | Created by the database |
| category_name | text | UQ | Yes | Unique; not blank (Rule 6) |
| description | text | | No | — |

### maintenance_request
One report of one problem, from the first report until it is resolved.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| request_id | int (identity) | PK | Yes | Created by the database |
| room_id | int | FK → room | Yes | Must match an existing room |
| category_id | int | FK → category | Yes | Must match an existing category |
| reported_by_id | int | FK → person | Yes | Must match an existing person |
| assigned_to_id | int | FK → person | No | Required before status moves past Reported; person must be Staff (Rule 2) |
| title | text | | Yes | Not blank |
| description | text | | Yes | Not blank |
| urgency | text | | Yes | Low, Medium, High, or Urgent |
| status | text | | Yes | Default Reported. Reported, Assigned, In Progress, or Resolved; moves forward only (Rule 3); cannot be Resolved while a vendor job is unfinished (Rule 4) |
| date_reported | timestamptz | | Yes | Filled in automatically |
| date_resolved | timestamptz | | No | Filled in automatically when Resolved, and only then; not before date_reported (Rule 5) |

### status_update
A dated note on a request. Together these rows make the request's history.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| update_id | int (identity) | PK | Yes | Created by the database |
| request_id | int | FK → maintenance_request | Yes | Must match an existing request |
| author_id | int | FK → person | Yes | Must match an existing person |
| note_text | text | | Yes | Not blank |
| new_status | text | | No | Same four values as maintenance_request.status; empty for a plain note |
| created_at | timestamptz | | Yes | Filled in automatically. Rows cannot be edited or deleted |

## Vendors & deliveries

### vendor
An outside company Wellspring hires or buys from.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| vendor_id | int (identity) | PK | Yes | Created by the database |
| vendor_name | text | UQ | Yes | Unique; not blank (Rule 6) |
| contact_name | text | | No | — |
| email | text | | No | Must contain @ when filled in |
| phone | text | | No | Digits, spaces, dashes and parentheses only |
| is_active | boolean | | Yes | Default true. Vendors are deactivated, never deleted (Rule 9) |

### service_type
A kind of service a vendor can offer.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| service_type_id | int (identity) | PK | Yes | Created by the database |
| service_name | text | UQ | Yes | Unique; not blank (Rule 6) |

### vendor_service
Links a vendor to each service it offers (many-to-many).

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| vendor_id | int | PK, FK → vendor | Yes | Must match an existing vendor |
| service_type_id | int | PK, FK → service_type | Yes | Must match an existing service type; the pair must be unique |

### vendor_job
One piece of work a vendor does for one maintenance request.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| job_id | int (identity) | PK | Yes | Created by the database |
| vendor_id | int | FK → vendor | Yes | Must match an existing, active vendor (Rules 7, 9) |
| request_id | int | FK → maintenance_request ✱ | Yes | Must match an existing request (Rule 7) |
| job_description | text | | Yes | Not blank |
| scheduled_date | date | | No | — |
| completed_date | date | | No | Not before scheduled_date (Rule 10) |
| final_cost | numeric(10,2) | | No | 0 or more (Rule 10) |

### delivery
One delivery of parts or supplies from a vendor.

| Column | Type | Key | Required | Validation / constraint |
|---|---|---|---|---|
| delivery_id | int (identity) | PK | Yes | Created by the database |
| vendor_id | int | FK → vendor | Yes | Must match an existing vendor |
| job_id | int | FK → vendor_job | No | Must match an existing job when filled in |
| item_description | text | | Yes | Not blank |
| status | text | | Yes | Default Ordered. Ordered, Received, or Cancelled |
| date_expected | date | | Yes | — |
| date_received | date | | No | Required when Received; empty otherwise (Rule 8) |
| received_by_id | int | FK → person ✱ | No | Required when Received; empty otherwise (Rule 8) |
| cost | numeric(10,2) | | No | 0 or more (Rule 10) |

✱ These were cross-database links (FK\*) in the plan. They are now real foreign keys.
